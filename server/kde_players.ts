import { DeskThing } from 'deskthing-server';

import * as dbusnext from 'dbus-next';
import * as dbusnative from 'dbus-native';

let dbus;
let bus;
let serviceNameBus;
let Variant;

let serviceName;

let properties;

let initialized = false;

async function init() {
  let dbus = require('dbus-next');
  let bus = dbus.sessionBus();
  let serviceNameBus = dbusnative.sessionBus();
  let Variant = dbus.Variant;

  try {
    async function detectPlayers() {
      const mediaPlayers = [                              // PUT HIGHER PRIORITY SELECTIONS AT THE BOTTOM OF THE LIST
          "org.mpris.MediaPlayer2.spotify",
          "org.mpris.MediaPlayer2.firefox.instance_",
          "org.mpris.MediaPlayer2.chromium.instance",
          "org.mpris.MediaPlayer2.google-chrome.instance_",
          "org.mpris.MediaPlayer2.YoutubeMusic",
          "org.kde.kdeconnect.mpris_",
          "org.kde.plasma.browser_integration", 
      ]
  
      const names: string[] = await new Promise((resolve, reject) => {
      serviceNameBus.listNames((err: any, results: any) => {
          if (err) {
          reject(err);
          } else {
          resolve(results);
          }
      });
      })
  
      for (const prefix of mediaPlayers) {
      const playerName = names.find((name: string) => name.startsWith(prefix))
      if (playerName) {
          serviceName = playerName;
          //DeskThing.sendLog('Found media player:' + serviceName);
      }
      }
      }
  
      await detectPlayers();
  
      const object = await bus.getProxyObject(serviceName, '/org/mpris/MediaPlayer2');
      const player = await object.getInterface('org.mpris.MediaPlayer2.Player');
      properties = await object.getInterface('org.freedesktop.DBus.Properties');
  } catch (error) {
    DeskThing.sendError(error);
  }
  initialized = true;
}

export async function sendCurrentPlayingData() {
  if (!initialized) {
    init();
  }
  try {
    const song_props = await properties.GetAll('org.mpris.MediaPlayer2.Player');
    const metadata = song_props.Metadata.value;
    //DeskThing.sendLog('METADATA: ' + JSON.stringify(metadata, (_, v) => typeof v === 'bigint' ? v.toString() : v));

    // Extract relevant information from the metadata
    const artist = metadata?.['xesam:artist']?.value[0] as string | undefined;
    const title = metadata?.['xesam:title'].value as string | undefined;
    const album = metadata?.['xesam:album'].value as string | undefined;

    //   DeskThing.sendLog(`Artist: ` + artist);
    DeskThing.sendLog(`Title: ` + title); // leaving uncommented for now for testing
    //   DeskThing.sendLog(`Album: ` + album);
    //   DeskThing.sendLog('---'); 
    const response = {
    type: "song",
    app: "client",
    payload: {
        id: title || "Unknown",
        album: album || "Unknown",
        artist: artist || "Unknown",
        track_name: title || "Unknown",
        thumbnail: null,
        track_length: 0,
        track_progress: 0,
        is_playing: true,
        volume: 0,
        shuffle_state: false,
        repeat_state: false,
        can_play: false,
        can_change_volume: true,
        playlist: "Not implemented",
    },
    };
    DeskThing.send(response);

  } catch (error) {
    DeskThing.sendError('Error:' + error);
  }
}