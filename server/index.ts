
import { DeskThing, SocketData } from "deskthing-server";
export { DeskThing };

import { sendImage, sendSampleData } from "./sendingData";

import * as dbus from 'dbus-next';
import * as dbusnative from 'dbus-native';



async function getCurrentPlayingData() {
  try {
    let dbus = require('dbus-next');
    let bus = dbus.sessionBus();
    let serviceNameBus = dbusnative.sessionBus();
    let Variant = dbus.Variant;

    let serviceName;

    async function detectPlayers() {
      const mediaPlayers = [
        'org.kde.plasma.browser_integration',                 // This is the one with actual information
        //'org.mpris.MediaPlayer2.firefox.instance_',   // This one might have the title plus source //TODO: Make this a backup
      ]
    
      const names: string[] = await new Promise((resolve, reject) => {
        serviceNameBus.listNames((err: any, results: any) => {
          if (err) {
            reject(err);
            DeskThing.sendLog("ERR" + err);
          } else {
            resolve(results);
            DeskThing.sendLog("RESULTS" + results);
          }
        });
      })

      DeskThing.sendLog("names: " + names);
      
      for (const prefix of mediaPlayers) {
        const playerName = names.find((name: string) => name.startsWith(prefix))
        if (playerName) {
          serviceName = playerName;
          DeskThing.sendLog('Found media player:' + serviceName);
        }
      }
    }
    
    await detectPlayers();

    const object = await bus.getProxyObject(serviceName, '/org/mpris/MediaPlayer2');
    const player = await object.getInterface('org.mpris.MediaPlayer2.Player');
    const properties = await object.getInterface('org.freedesktop.DBus.Properties');

    const song_props = await properties.GetAll('org.mpris.MediaPlayer2.Player');
    const metadata = song_props.Metadata.value;
    DeskThing.sendLog('METADATA: ' + JSON.stringify(metadata, (_, v) => typeof v === 'bigint' ? v.toString() : v));

    // Extract relevant information from the metadata
    const artist = metadata?.['xesam:artist']?.value[0] as string | undefined;
    const title = metadata?.['xesam:title'].avalue as string | undefined;
    const album = metadata?.['xesam:album'].value as string | undefined;

    DeskThing.sendLog(`Now Playing (Firefox):`);
    DeskThing.sendLog(`Artist: ` + artist);
    DeskThing.sendLog(`Title: ` + title);
    DeskThing.sendLog(`Album: ` + album);
    DeskThing.sendLog('---'); 


  } catch (error) {
    DeskThing.sendError('Error:' + error);
  }
}

const start = async () => {
  const Data = await DeskThing.getData();

  getCurrentPlayingData();
};

const stop = async () => {
  DeskThing.sendLog('Server Stopped');
};





// Main Entrypoint of the server
DeskThing.on("start", start);

// Main exit point of the server
DeskThing.on("stop", stop);

