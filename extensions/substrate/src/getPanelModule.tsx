import React from 'react';

import { AgentIsland } from './ui/AgentIsland';

export const AGENT_PANEL_ID = '@substrate/extension-substrate.panelModule.agent';
export const AGENT_STATUS_ID = '@substrate/extension-substrate.panelModule.agentStatus';

export default function getPanelModule({ servicesManager }) {
  const AgentWorkPanel = () => (
    <AgentIsland
      services={servicesManager.services}
      placement="panel"
      elevation="flush"
    />
  );
  const AgentStatus = () => <AgentIsland services={servicesManager.services} />;

  return [
    {
      name: 'agent',
      iconName: 'tab-linear',
      iconLabel: 'Agent',
      label: 'Agent',
      component: AgentWorkPanel,
    },
    {
      name: 'agentStatus',
      iconName: 'tab-linear',
      iconLabel: 'Agent status',
      label: 'Agent status',
      component: AgentStatus,
    },
  ];
}
