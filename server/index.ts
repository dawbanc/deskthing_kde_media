
import { DeskThing, SocketData } from "deskthing-server";
export { DeskThing };

import { sendImage, sendSampleData } from "./sendingData";
import { sendCurrentPlayingData } from "./kde_players.ts";

const handleRequest = async (request: SocketData) => {
  if (request.request === "song") {
    // send song data
    DeskThing.sendLog("Request for song data recieved");
    sendCurrentPlayingData();
  } else if (request.request === "refresh") {
    DeskThing.sendLog("Request for refresh recieved");
    sendCurrentPlayingData();
  } else {
    DeskThing.sendError("Unknown request from client..." + request.request);
  }
};

const handleSet = async (request: SocketData) => {
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
      DeskThing.sendLog("play pressed\ndata: " + request.payload);
      break;
    case "pause":
      // call pause?
      DeskThing.sendLog("pause pressed");
      break;
    case "stop":
      // call stop
      DeskThing.sendLog("stop pressed");
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

const start = async () => {
  const Data = await DeskThing.getData();

  sendCurrentPlayingData();

  DeskThing.on("get", handleRequest);
  DeskThing.on("set", handleSet);

};

const stop = async () => {
  DeskThing.sendLog('Server Stopped');
};


// Main Entrypoint of the server
DeskThing.on("start", start);

// Main exit point of the server
DeskThing.on("stop", stop);

