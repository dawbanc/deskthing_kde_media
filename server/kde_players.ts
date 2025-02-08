import { DeskThing, SocketData } from 'deskthing-server';

import * as dbusnext from 'dbus-next';
import * as dbusnative from 'dbus-native';

import * as fs from "fs/promises";
import { exec } from 'child_process';
import tmp from 'tmp';

let bus;
let serviceName;

let object;
let player;
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
  
      object = await bus.getProxyObject(serviceName, '/org/mpris/MediaPlayer2');
      player = await object.getInterface('org.mpris.MediaPlayer2.Player');
      properties = await object.getInterface('org.freedesktop.DBus.Properties');
  } catch (error) {
    DeskThing.sendError(error);
  }
  initialized = true;
};

async function encodeImageFromUrl(uri: string, type: "jpeg" | "gif" = "jpeg", retries = 3): Promise<string | null> {  // TODO: rework this once sharp/canvas is fixed
  try {
    let image_buf: Buffer;
    let file_path: string;

    if (uri.startsWith("file://")) {
      file_path = uri.replace("file://", "");
      try {
        image_buf = await fs.readFile(file_path); 
      } catch (readError) {
        DeskThing.sendError(`Error reading file: ${readError}`);
        return null;
      }
    } else {
      const image_request = await fetch(uri);

      if (!image_request.ok) {
        DeskThing.sendError("HTTP error when fetching image: " + image_request.status);
        return null;
      }

      image_buf = Buffer.from(await image_request.arrayBuffer());
    }

    return new Promise<string | null>((resolve, reject) => {
      tmp.file({ postfix: `.${type}` }, async (err, path, cleanupCallback) => { 
        if (err) {
          DeskThing.sendError("Error creating temporary file: " + err);
          return resolve(null);
        }

        try {
          await fs.writeFile(path, image_buf); 
          exec(`convert ${path} -format ${type} ${path}`, async (error, stdout, stderr) => {
            if (error) {
              DeskThing.sendError(`ImageMagick error: ${error}`);
              resolve(null);
            } else {
              try {
                const converted_buf = await fs.readFile(path); 
                const base64 = converted_buf.toString("base64");
                resolve(`data:image/${type};base64,${base64}`);
              } catch (readError) {
                DeskThing.sendError(`Error reading converted image: ${readError}`);
                resolve(null);
              }
            }
            cleanupCallback();
          });
        } catch (writeErr) {
          DeskThing.sendError("Error writing to temporary file: " + writeErr);
          resolve(null);
        }
      });
    });

  } catch (error) {
    DeskThing.sendError(error);

    if (retries > 0) {
      return encodeImageFromUrl(uri, type, retries - 1);
    }

    DeskThing.sendError("Failed to encode image after multiple retries from: " + uri);
    return null;
  }
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

    const thumbnail = await encodeImageFromUrl(metadata?.["mpris:artUrl"].value, "jpeg");

    //   DeskThing.sendLog(`Artist: ` + artist);
    DeskThing.sendLog(`Title: ` + title); // leaving uncommented for now for testing
    DeskThing.sendLog('Position: ' + Number(song_props.Position?.value / BigInt(1000)))
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
        thumbnail: thumbnail,
        track_length: Number(metadata["mpris:length"]?.value / BigInt(1000)) || 0,
        track_progress: Number(song_props.Position?.value / BigInt(1000)) || 0,
        is_playing: song_props.PlaybackStatus?.value === "Playing",
        volume: (song_props.Volume?.value || 0) * 100,
        shuffle_state: song_props.Shuffle?.value || false,
        repeat_state: song_props.LoopStatus?.value || "None",
        can_play: song_props.CanPlay?.value || false,
        can_change_volume: true,
        playlist: "Not implemented",
    },
    };
    DeskThing.send(response);

  } catch (error) {
    DeskThing.sendError('Error:' + error);
  }
}

export async function setCommand(request: SocketData) {
  // const object = await bus.getProxyObject(serviceName, '/org/mpris/MediaPlayer2');
  // const player = await object.getInterface('org.mpris.MediaPlayer2.Player');
  if (player === null) {
    DeskThing.sendLog("player is null; cannot process request");
    return;
  }
  switch (request.request) {
    case "next":
      // call next
      DeskThing.sendLog("Next pressed");
      break;
    case "previous":
      // call previous
      DeskThing.sendLog("Previous pressed");
      break;
    case "fast_forward":
      // call fastForward
      DeskThing.sendLog("fast_forward pressed\ndata: " + request.payload);
      break;
    case "rewind":
      // call rewind
      DeskThing.sendLog("rewind pressed\ndata: " + request.payload);
      break;
    case "play":
      // call play
      await player.Play();
      DeskThing.sendLog("play pressed\nPlayer is null:" + (player === null));
      break;
    case "pause":
      // call pause?
      await player.Pause();
      DeskThing.sendLog("pause pressed\nPlayer is null:" + (player === null));
      break;
    case "stop":
      // call stop
      await player.Stop();
      DeskThing.sendLog("stop pressed\nPlayer is null:" + (player === null));
      break;
    case "seek":
      // call seek
      DeskThing.sendLog("seek called\ndata: " + request.payload);
      break;
    case "like":
      // call like
      DeskThing.sendLog("like called");
      break;
    case "volume":
      // call volume
      DeskThing.sendLog("volume called\ndata: " + request.payload);
      break;
    case "repeat":
      // call repeat
      DeskThing.sendLog("repeat called\ndata: " + request.payload);
      break;
    case "shuffle":
      DeskThing.sendLog("shuffle called\ndata: " + request.payload);
      break;
  }
}