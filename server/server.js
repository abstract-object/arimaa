// server.js

const express = require('express');
const queryString = require("query-string");
const WebSocket = require('ws');
const SocketServer = WebSocket.Server;

const { MongoClient } = require("mongodb");
const MONGODB_URI = "mongodb://localhost:27017/arimaa";

const uuid = require("uuidv1");

// Set the port to 3001
const PORT = 3001;

// Create a new express server
const server = express()
  // Make the express server serve static assets (html, javascript, css) from the /public folder
  .use(express.static('public'))
  .listen(PORT, '0.0.0.0', 'localhost', () => console.log(`Listening on ${PORT}`));

MongoClient.connect(MONGODB_URI, (err, db) => {
  if (err) {
    console.error(`Failed to connect: ${MONGODB_URI}`);
    throw err;
  }

  console.log(`Connected to mongodb: ${MONGODB_URI}`);

  const DataHelpers = require("./data.js")(db);

  // Create the WebSockets server
  const wss = new SocketServer({ server });

  const usersOnline = {};
  const viewedGames = {};

  const initBoard = () => {
    const board = {};
    for (let i = 0; i < 8; i++) {
      for (let rank = 1; rank < 9; rank++) {
        let fileValue = (i + 10).toString(18).toLowerCase();
        board[fileValue + rank] = { piece: null, type: ((fileValue === "c" || fileValue === "f") && (rank === 3 || rank === 6) && "trap" || (rank === 1 && "silverGoal") || (rank === 8) && "goldGoal") || null };
      }
    }
    return board;
  }

  const setupGame = game => {
    let playOrder = Math.random() < 0.5 ? ["gold", "silver"] : ["silver", "gold"];

    game.players[playOrder.shift()] = game.players.list[0].id;
    game.players[playOrder.shift()] = game.players.list[1].id;

    game.status = "setup";

    viewedGames[game.id].forEach(id => {
      updateGame(game, usersOnline[id]);
    });
  }

  const makeAMove = (game, move) => {

  }

  const addToGame = (game, user) => {
    if (viewedGames[game.id]) {
      viewedGames[game.id].includes(user.id) || viewedGames[game.id].push(user.id);
    } else {
      viewedGames[game.id] = [user.id];
    }

    if (game.status === "waitForPlayer2") {
      game.players.list.push({ id: user.playerId, name: user.playerName });
      setupGame(game);
    }
  }

  const updateGame = (game, user) => {
    DataHelpers.saveGame(game);

    let output = Object.assign({}, game);
    output.players = {
      list: [],
      gold: null,
      silver: null
    };

    game.players.list.forEach(player => {
      output.players.list.push(player.name);
      (game.players.gold === player.id) && (output.players.gold = player.name);
      (game.players.silver === player.id) && (output.players.silver = player.name);
    });

    if (viewedGames[game.id].includes(user.id)) {
      user.send(JSON.stringify({ type: "updateGame", game: output }));
    } else {
      if (viewedGames[game.id].length <= 1) {
        delete viewedGames[game.id];
      } else {
        viewedGames[game.id].splice(viewedGames[game.id].indexOf(user.id), 1);
      }
    }
  }

  // Set up a callback that will run when a client connects to the server
  // When a client connects they are assigned a socket, represented by
  // the ws parameter in the callback.
  wss.on('connection', (ws) => {
    console.log('Client connected');
    ws.id = uuid();
    usersOnline[ws.id] = ws;
    ws.send(JSON.stringify({ type: "sessionId", value: ws.id }));

    // Update user count when a user connects
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "clientCount", value: wss.clients.size }));
      }
    });

    // Give each message a unique id and the associated user's colour
    ws.on('message', (message) => {
      message = JSON.parse(message);
      switch (message.type) {
        case "identify":
          if (!message.playerId) {
            ws.playerId = uuid();
            ws.playerName = message.playerName || "Anonymous";
            ws.send(JSON.stringify({ type: "playerId", value: ws.playerId }));
          } else {
            ws.playerId = message.playerId;
          }
          usersOnline[ws.id].playing = message.playing;
          break;
        case "newGame":
          let game = {
            id: uuid(),
            status: "waitForPlayer2",
            players: {
              list: [{id: ws.playerId, name: ws.playerName}],
              gold: null,
              silver: null
            },
            board: initBoard(),
            moveList: [],
            turnCount: 0,
            turnPlayer: "gold",
            winner: null
          };
          addToGame(game, ws);
          updateGame(game, ws);
          break;
        case "joinGame":
          let game = DataHelpers.getGame(message.gameId);
          if (game) {
            addToGame(game, ws);
            updateGame(game, ws);
          } else {
            ws.send(JSON.stringify({ type: "error", message: `Game ${message.gameId} does not exist.` }));
          }
          break;
        case "move":
          let game = DataHelpers.getGame(message.gameId);
          if (game.players[turnPlayer] === message.playerId) {
            makeAMove(game, message.value)
          }
          break;
      }

      // Broadcast new message back to every connected user
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(message));
        }
      });
    });

    // Set up a callback for when a client closes the socket. This usually means they closed their browser.
    ws.on('close', () => {
      console.log('Client disconnected')
      usersOnline[ws.id] = null;

      // Update user count when user disconnects
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "clientCount", value: wss.clients.size }));
        }
      });
    });
  });
});