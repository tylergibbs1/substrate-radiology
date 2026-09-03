import dcmjs from 'dcmjs';

import {
  signedVersion,
  signature,
  signatureIsStale,
  type ReportVersion,
  type Signature,
} from './report';

type Evidence = {
  StudyInstanceUID: string;
  SeriesInstanceUID: string;
  SOPInstanceUID: string;
  SOPClassUID: string;
  PatientID?: string;
  PatientName?: string;
  PatientBirthDate?: string;
  PatientSex?: string;
  StudyDate?: string;
  StudyTime?: string;
  StudyID?: string;
  AccessionNumber?: string;
  StudyDescription?: string;
};

type ExportPacket = {
  version: ReportVersion;
  signed: Signature;
  stale: boolean;
  measurements: Map<string, { label: string; value: string }>;
  evidence: Evidence;
};

function requirePacket(_services: Record<string, unknown>): ExportPacket {
  const version = signedVersion();
  const signed = signature();
  if (!version || !signed) throw new Error('Sign the report before exporting it.');

  const measurements = new Map<string, { label: string; value: string }>();
  for (const snapshot of version.measurements) {
    measurements.set(snapshot.measurementId, { label: snapshot.label, value: snapshot.value });
  }

  const evidence = version.evidence as Evidence | null;
  if (!evidence) throw new Error('The signed report has no immutable source-image evidence.');
  if (!evidence.StudyInstanceUID || !evidence.SeriesInstanceUID || !evidence.SOPInstanceUID) {
    throw new Error(
      'The signed report has incomplete source-image evidence and cannot be exported.'
    );
  }

  return { version, signed, stale: signatureIsStale(), measurements, evidence };
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function code(value: string, meaning: string) {
  return new dcmjs.sr.coding.CodedConcept({
    value,
    schemeDesignator: '99SUBSTRATE',
    meaning,
  });
}

/** A real DICOM Part 10 Comprehensive 3D SR containing the report and provenance. */
export function buildDicomSr(services: Record<string, unknown>): Blob {
  const packet = requirePacket(services);
  const { ContainerContentItem, TextContentItem, PNameContentItem } = dcmjs.sr.valueTypes;
  const root = new ContainerContentItem({
    name: new dcmjs.sr.coding.CodedConcept({
      value: '18748-4',
      schemeDesignator: 'LN',
      meaning: 'Diagnostic imaging study',
    }),
  });
  root.ContentSequence = [];

  for (const [sectionName, sentences] of groupSections(packet.version)) {
    const section = new ContainerContentItem({
      name: code('SECTION', sectionName),
      relationshipType: 'CONTAINS',
    });
    section.ContentSequence = [];
    for (const sentence of sentences) {
      const narrative = new TextContentItem({
        name: code('REPORT_TEXT', 'Report narrative'),
        relationshipType: 'CONTAINS',
        value: sentence.text,
      });
      narrative.ContentSequence = sentence.provenance.map(citation => {
        const measurement = packet.measurements.get(citation.measurementId);
        return new TextContentItem({
          name: code('PROVENANCE', 'Measurement provenance'),
          relationshipType: 'HAS PROPERTIES',
          value: `${measurement?.label ?? citation.measurementId}: ${measurement?.value ?? 'Value unavailable'} [${citation.measurementId}]`,
        });
      });
      section.ContentSequence.push(narrative);
    }
    root.ContentSequence.push(section);
  }

  root.ContentSequence.push(
    new PNameContentItem({
      name: code('SIGNER', 'Report signer'),
      relationshipType: 'CONTAINS',
      value: packet.signed.signer,
    }),
    new TextContentItem({
      name: code('ATTESTATION', 'Signature attestation'),
      relationshipType: 'CONTAINS',
      value: packet.signed.attestation,
    }),
    new TextContentItem({
      name: code('SHA256', 'SHA-256 report digest'),
      relationshipType: 'CONTAINS',
      value: `${packet.signed.hash}${packet.stale ? ' (STALE - does not match current report)' : ''}`,
    })
  );

  const dataset = new dcmjs.sr.documents.Comprehensive3DSR({
    content: root,
    evidence: [packet.evidence],
    seriesInstanceUID: dcmjs.data.DicomMetaDictionary.uid(),
    seriesNumber: 999,
    seriesDescription: 'Substrate signed report',
    sopInstanceUID: dcmjs.data.DicomMetaDictionary.uid(),
    instanceNumber: packet.version.version,
    manufacturer: 'Substrate',
    isComplete: true,
    isVerified: !packet.stale,
    isFinal: !packet.stale,
    verifyingObserverName: packet.stale ? undefined : packet.signed.signer,
    verifyingOrganization: packet.stale ? undefined : 'Substrate research viewer',
  });
  dataset.SpecificCharacterSet = 'ISO_IR 192';
  dataset.SeriesDate = dcmjs.data.DicomMetaDictionary.date();
  dataset.SeriesTime = dcmjs.data.DicomMetaDictionary.time();
  dataset._meta = {
    TransferSyntaxUID: {
      Value: ['1.2.840.10008.1.2.1'],
      vr: 'UI',
    },
  };
  return dcmjs.data.datasetToBlob(dataset);
}

function groupSections(version: ReportVersion): Map<string, ReportVersion['sentences']> {
  const sections = new Map<string, ReportVersion['sentences']>();
  for (const sentence of version.sentences.filter(row => row.review !== 'rejected')) {
    const rows = sections.get(sentence.section) ?? [];
    rows.push(sentence);
    sections.set(sentence.section, rows);
  }
  return sections;
}

type PdfLine = { text: string; size: number; bold?: boolean; gap?: number; color?: string };

function ascii(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E]/g, '?');
}

function wrap(text: string, max: number): string[] {
  const words = ascii(text).split(/\s+/).filter(Boolean);
  const rows: string[] = [];
  let row = '';
  for (const word of words) {
    const next = row ? `${row} ${word}` : word;
    if (next.length > max && row) {
      rows.push(row);
      row = word;
    } else row = next;
  }
  if (row) rows.push(row);
  return rows.length ? rows : [''];
}

function pdfEscape(text: string): string {
  return ascii(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function personName(text: string | undefined): string {
  if (!text) return 'Not provided';
  const parts = text.split('^').filter(Boolean);
  return parts.length > 1 ? `${parts[0]}, ${parts.slice(1).join(' ')}` : text;
}

function studyDate(text: string | undefined): string {
  if (!text || !/^\d{8}$/.test(text)) return text || 'Date not provided';
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}`;
}

/** Small dependency-free PDF writer: selectable text, pagination and a verifiable footer. */
export function buildPdf(services: Record<string, unknown>): Blob {
  const packet = requirePacket(services);
  const lines: PdfLine[] = [
    { text: 'SUBSTRATE / SIGNED REPORT', size: 9, bold: true, color: '0.15 0.45 0.42' },
    { text: packet.version.template, size: 19, bold: true, gap: 8 },
    {
      text: packet.stale ? 'STALE SIGNATURE - REPORT CHANGED AFTER SIGNING' : 'SIGNED AND VERIFIED',
      size: 10,
      bold: true,
      color: packet.stale ? '0.72 0.24 0.16' : '0.15 0.45 0.42',
      gap: 13,
    },
    ...wrap(
      `Patient: ${personName(packet.evidence.PatientName)}  |  ID: ${packet.evidence.PatientID || 'Not provided'}`,
      92
    ).map(text => ({ text, size: 9 })),
    ...wrap(
      `Study: ${studyDate(packet.evidence.StudyDate)}  |  ${packet.evidence.StudyDescription || packet.evidence.StudyInstanceUID}`,
      92
    ).map((text, index, rows) => ({ text, size: 9, gap: index === rows.length - 1 ? 13 : 0 })),
  ];
  for (const [section, sentences] of groupSections(packet.version)) {
    lines.push({ text: section.toUpperCase(), size: 10, bold: true, gap: 8 });
    for (const sentence of sentences) {
      for (const row of wrap(sentence.text, 88)) lines.push({ text: row, size: 10.5 });
      for (const citation of sentence.provenance) {
        const measurement = packet.measurements.get(citation.measurementId);
        lines.push({
          text: `  Evidence: ${measurement?.label ?? citation.measurementId} - ${measurement?.value ?? 'Value unavailable'}`,
          size: 8.5,
          color: '0.32 0.36 0.38',
        });
      }
      lines.push({ text: '', size: 5, gap: 4 });
    }
  }
  if (packet.measurements.size > 0) {
    lines.push({ text: 'MEASUREMENTS', size: 10, bold: true, gap: 8 });
    for (const [measurementId, measurement] of packet.measurements) {
      lines.push({ text: `${measurement.label}: ${measurement.value}`, size: 9.5 });
      lines.push({
        text: `  Measurement ID: ${measurementId}`,
        size: 7.5,
        color: '0.42 0.45 0.47',
      });
    }
    lines.push({ text: '', size: 5, gap: 7 });
  }
  lines.push(
    { text: 'SIGNATURE', size: 10, bold: true, gap: 8 },
    { text: packet.signed.signer, size: 11, bold: true },
    { text: new Date(packet.signed.ts).toLocaleString(), size: 9 },
    ...wrap(packet.signed.attestation, 96).map(text => ({ text, size: 8.5 })),
    { text: `SHA-256 ${packet.signed.hash}`, size: 7.5, gap: 4 }
  );

  const pages: PdfLine[][] = [[]];
  let y = 728;
  for (const line of lines) {
    const height = line.size * 1.35 + (line.gap ?? 0);
    if (y - height < 70) {
      pages.push([]);
      y = 728;
    }
    pages[pages.length - 1].push(line);
    y -= height;
  }

  const objects: string[] = [];
  const add = (body: string): number => (objects.push(body), objects.length);
  const catalog = add('');
  const pagesId = add('');
  const regular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageIds: number[] = [];

  pages.forEach((page, pageIndex) => {
    let cursor = 728;
    const commands: string[] = [];
    for (const line of page) {
      cursor -= line.gap ?? 0;
      const color = line.color ?? '0.12 0.15 0.17';
      commands.push(
        `BT /${line.bold ? 'F2' : 'F1'} ${line.size} Tf ${color} rg 54 ${cursor.toFixed(1)} Td (${pdfEscape(line.text)}) Tj ET`
      );
      cursor -= line.size * 1.35;
    }
    commands.push(
      `BT /F1 7 Tf 0.42 0.45 0.47 rg 54 36 Td (Substrate research use only - ${pdfEscape(packet.signed.hash.slice(0, 16))}) Tj ET`,
      `BT /F1 7 Tf 0.42 0.45 0.47 rg 520 36 Td (${pageIndex + 1} / ${pages.length}) Tj ET`
    );
    const stream = commands.join('\n');
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${content} 0 R >>`
    );
    pageIds.push(pageId);
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let body = '%PDF-1.4\n%Substrate\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .slice(1)
    .map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([body], { type: 'application/pdf' });
}

export function exportPdf(services: Record<string, unknown>): void {
  const version = signedVersion();
  download(buildPdf(services), `Substrate-report-v${version?.version ?? 1}.pdf`);
}

export function exportDicomSr(services: Record<string, unknown>): void {
  const version = signedVersion();
  download(buildDicomSr(services), `Substrate-report-v${version?.version ?? 1}.dcm`);
}
