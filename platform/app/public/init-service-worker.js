// https://developers.google.com/web/tools/workbox/modules/workbox-window
// All major browsers that support service worker also support native JavaScript
// modules, so it's perfectly fine to serve this code to any browsers
// (older browsers will just ignore it)
//
//import { Workbox } from './workbox-window.prod.mjs';
// proper initialization
if ('function' === typeof importScripts) {
  importScripts(
    'https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-window.prod.mjs'
  );

  var supportsServiceWorker = 'serviceWorker' in navigator;
  var isNotLocalDevelopment = ['localhost', '127'].indexOf(location.hostname) === -1;

  if (supportsServiceWorker && isNotLocalDevelopment) {
    const swFileLocation = (window.PUBLIC_URL || '/') + 'sw.js';
    const wb = new Workbox(swFileLocation);
    let isReloadingForUpdate = false;

    // A generated worker calls skipWaiting() and clientsClaim(), so it can take
    // control without ever entering Workbox's `waiting` state. Reload whenever
    // a newly installed worker takes control; otherwise the current document
    // can remain on the previous precached app shell until the user closes it.
    wb.addEventListener('controlling', () => {
      if (isReloadingForUpdate) {
        return;
      }

      isReloadingForUpdate = true;
      window.location.reload();
    });

    // Add an event listener to detect when the registered
    // service worker has installed but is waiting to activate.
    wb.addEventListener('waiting', event => {
      // customize the UI prompt accordingly.
      const isFirstTimeUpdatedServiceWorkerIsWaiting = event.wasWaitingBeforeRegister === false;
      console.log(
        'isFirstTimeUpdatedServiceWorkerIsWaiting',
        isFirstTimeUpdatedServiceWorkerIsWaiting
      );

      // Assumes your app has some sort of prompt UI element
      // that a user can either accept or reject.
      // const prompt = createUIPrompt({
      //  onAccept: async () => {
      // Send a message telling the service worker to skip waiting.
      // This will trigger the `controlling` event handler above.
      // Note: for this to work, you have to add a message
      // listener in your service worker. See below.
      wb.messageSW({ type: 'SKIP_WAITING' });
      // },

      // onReject: () => {
      //   prompt.dismiss();
      // },
      // });
    });

    wb.register().then(registration => registration && registration.update());
  }
}
