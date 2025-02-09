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
          await fs.writeFile(path, image_buf); // Use fs.promises.writeFile
  
          exec(`convert ${path} -format ${type} ${path}`, async (error, stdout, stderr) => {
            if (error) {
              DeskThing.sendError(`ImageMagick error: ${error}`);
              if (stderr) {
                DeskThing.sendError(`ImageMagick stderr: ${stderr}`);
              }
              cleanupCallback(); // Cleanup even on error
              resolve(null);
            } else {
              try {
                const converted_buf = await fs.readFile(path); // Use fs.promises.readFile
                const base64 = converted_buf.toString("base64");
                resolve(`data:image/${type};base64,${base64}`);
              } catch (readError) {
                DeskThing.sendError(`Error reading converted image: ${readError}`);
                resolve(null);
              } finally { // Ensure cleanup happens *after* reading
                cleanupCallback();
              }
            }
          });
        } catch (writeErr) {
          DeskThing.sendError("Error writing to temporary file: " + writeErr);
          cleanupCallback(); // Cleanup even on write error
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
    await init();
  }
  if (!properties) {
    DeskThing.sendLog("Properties not ready yet");
    return;
  }
  try {
    const song_props = await properties.GetAll('org.mpris.MediaPlayer2.Player');
    const metadata = song_props.Metadata.value;

    // Extract relevant information from the metadata
    const artist = metadata?.['xesam:artist']?.value[0] as string | undefined;
    const title = metadata?.['xesam:title'].value as string | undefined;
    const album = metadata?.['xesam:album'].value as string | undefined;

    const thumbnail = await encodeImageFromUrl(metadata?.["mpris:artUrl"].value, "jpeg");

    //   DeskThing.sendLog(`Artist: ` + artist);
    DeskThing.sendLog(`Title: ` + title); // leaving uncommented for now for testing
    DeskThing.sendLog('Position: ' + Number(song_props.Position?.value / BigInt(1000)));
    DeskThing.sendLog('length: ' + Number(metadata["mpris:length"]?.value / BigInt(1000)));
    // track_length: Number(metadata["mpris:length"]?.value / BigInt(1000)) || 0, // OLD
    // track_progress: Number(song_props.Position?.value / BigInt(1000)) || 0,
    // track_length: 10000,       // NEW?
    //     track_progress: Number(song_props.Position?.value / metadata["mpris:length"]?.value) * 10000 || 0,
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
        track_length: Number(metadata["mpris:length"]?.value / BigInt(1000)) || 0, // OLD
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
  if ((player === null) || (properties === null)) {
    DeskThing.sendLog("player or properties are null; cannot process request");
    return;
  } 
  switch (request.request) {
    case "next":
      // call next
      await player.Next();
      //DeskThing.sendLog("Next pressed");
      break;
    case "previous":
      // call previous
      player.Previous();
      //DeskThing.sendLog("Previous pressed");
      break;
    case "fast_forward":
      // call fastForward
      //DeskThing.sendLog("fast_forward pressed\ndata: " + request.payload);
      break;
    case "rewind":
      // call rewind
      //DeskThing.sendLog("rewind pressed\ndata: " + request.payload);
      break;
    case "play":
      // call play
      await player.Play();
      //DeskThing.sendLog("play pressed\nPlayer is null:" + (player === null));
      break;
    case "pause":
      // call pause?
      await player.Pause();
      //DeskThing.sendLog("pause pressed\nPlayer is null:" + (player === null));
      break;
    case "stop":
      // call stop
      await player.Stop();
      //DeskThing.sendLog("stop pressed\nPlayer is null:" + (player === null));
      break;
    case "seek":
      // call seek
      // const song_props = await properties.GetAll('org.mpris.MediaPlayer2.Player');
      // const metadata = song_props.Metadata.value;

      // const length = Number(metadata["mpris:length"]?.value / BigInt(1000));
      // DeskThing.sendLog('Length: ' + metadata["mpris:length"]?.value);

      // const trackID = metadata?.['xesam:title'].value as string | undefined;
      // DeskThing.sendLog(`Title: ` + trackID);

      // const seek = Number(request.payload) / 10000;
      // DeskThing.sendLog(`Seek: ` + seek);

      // const position = Math.round(length * seek);

      // DeskThing.sendLog("seek called\nrecieved:" + request.payload + "\nseek: " + seek + "\nseeking to: " + position + "\nlength: " + length);
      // await player.SetPosition(trackID, position);
      // DeskThing.sendLog("seek completed");
      try {
        const song_props = await properties.GetAll('org.mpris.MediaPlayer2.Player');
        const metadata = song_props.Metadata.value;
    
        const lengthBigInt = metadata["mpris:length"]?.value;  // Get as BigInt
        if (lengthBigInt === undefined) {
          DeskThing.sendLog('Error: mpris:length is undefined');
          return; // Or throw an error
        }
    
        const lengthSeconds = Number(lengthBigInt / 1000n); // Convert to seconds (Number)
        DeskThing.sendLog('Length (seconds): ' + lengthSeconds);
    
        const trackID = metadata?.['xesam:title']?.value as string | undefined; // Optional chaining
        if (trackID === undefined) {
          DeskThing.sendLog('Error: xesam:title is undefined');
          return; // Or throw an error
        }
        DeskThing.sendLog(`Title: ${trackID}`);
    
        const seekPercent = Number(request.payload) / 10000; // Percentage (0-1)
        DeskThing.sendLog(`Seek (percentage): ${seekPercent}`);
    
        const positionMicrosecondsBigInt = BigInt(Math.round(lengthSeconds * seekPercent * 1000000)); // Calculate position in microseconds (BigInt)
    
        DeskThing.sendLog("Seek called\nreceived:" + request.payload + "\nseek (percentage): " + seekPercent + "\nseeking to (microseconds): " + positionMicrosecondsBigInt + "\nlength (seconds): " + lengthSeconds);
    
        //const positionMicrosecondsString = positionMicrosecondsBigInt.toString();
        await player.SetPosition(trackID, positionMicrosecondsBigInt); 
        DeskThing.sendLog("Seek completed");
    
      } catch (error) {
        DeskThing.sendError(`Error during seek: ${error}`); // Proper error handling
      }

      break;
    case "like":
      // call like
      DeskThing.sendLog("like called");
      break;
    case "volume":
      // call volume
      const vol = new dbusnext.Variant('d', Math.round(Number(request.payload) / 100));
      await properties.Set('org.mpris.MediaPlayer2.Player', 'Volume', vol);
      //DeskThing.sendLog("volume called\ndata: " + request.payload);
      break;
    case "repeat":
      // call repeat
      if (request.payload){
        const repeat = new dbusnext.Variant('s', String(request.payload).charAt(0).toUpperCase() + String(request.payload).slice(1));
        await properties.Set('org.mpris.MediaPlayer2.Player', 'LoopStatus', repeat);
        //DeskThing.sendLog("repeat called\ndata: " + request.payload);        
      } else {
        DeskThing.sendError("Repeat called but payload is empty");
      }
      break;
    case "shuffle":
      if (request.payload){
        const shuffle = new dbusnext.Variant('b', String(request.payload));
        await properties.Set('org.mpris.MediaPlayer2.Player', 'Shuffle', shuffle);
        //DeskThing.sendLog("shuffle called\ndata: " + request.payload);
      } else {
        DeskThing.sendError("Shuffle called but payload is empty");
      }
      break;
  }
}