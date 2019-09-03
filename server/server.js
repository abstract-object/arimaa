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
  const GameLogic = require("./game.js");

  // Create the WebSockets server
  const wss = new SocketServer({ server });

  // Track users online by session id, and which games are seen by which users
  const usersOnline = {};
  const viewedGames = {};

  const initBoard = () => {
    const board = {};
    for (let i = 0; i < 8; i++) {
      for (let rank = 1; rank < 9; rank++) {
        let fileValue = (i + 10).toString(18).toLowerCase();
        board[fileValue + rank] = {piece: null, type: ((fileValue === "c" || fileValue === "f") && (rank === 3 || rank === 6) && "trap" || (rank === 1 && "silverGoal") || (rank === 8) && "goldGoal") || null};
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

  const makeAMove = (game, player, moves) => {
    let newBoard = Object.assign({}, game.board);
    let valid = true;
    let locations = [];
    
    switch (moves.type) {
      case "setup":
        let pieces = {};  
        for (let move of moves) {
          if (game.status === "setup" 
          && 
          move.destination[0] >= "a" && move.destination[0] <= "h"
          &&
          ((game.turnPlayer === "gold" && Number(move.destination[1]) < 3 && move.piece === move.piece.toUpperCase()) 
          || 
          (game.turnPlayer === "silver" && Number(move.destination[1]) > 6 && move.piece === move.piece.toLowerCase()))) {
            game.pieces[game.turnPlayer][move.piece] -= 1;
            newBoard[move.destination].piece = move.piece;

            let strength = 0;

            switch (move.piece.toLowerCase()) {
              case "e":
                strength += 1;
              case "m":
                strength += 1;
              case "h":
                strength += 1;
              case "d":
                strength += 1;
              case "c":
                strength += 1;
              case "r":
                strength = 0;
                break;
            }

            pieces[move.destination] = {
              colour: game.turnPlayer, 
              type: move.piece, 
              strength: strength,
              isFrozen: false, 
              canMoveTo: [], 
              canPush: [], 
              canBePushedTo: [],
              canPull: []
            };

          } else {
            valid = false;
            break;
          }
        };
      
        Object.values(game.pieces[game.turnPlayer]).forEach(remaining => {
          remaining === 0 || (valid = false);
        });

        if (valid) {
          game.pieces = pieces, game.board = newBoard;
          GameLogic.updateMovedAndAdjacentPieces(game, locations);
        }
        break;
      case "play":
        break;
      case "resetTurn":
        let savedGame = DataHelpers.getGame(game.id);
        updateGame(savedGame, player);
        break;
      case "resign":
        break;
    }

    if (valid) {
      updateGameState(game, "end");
      if (game.turnPlayer = "silver") {
        game.turnPlayer = "gold";
        game.turnCount += 1;
        (game.status === "setup" && turnCount > 0) && (game.status = "playing");
      } else {
        game.turnPlayer = "silver";
      }
      game.board = newBoard;
      saveBoardPosition(game);
      viewedGames[game.id].forEach(id => {
        updateGame(game, usersOnline[id]);
      });
    } else {
      return {error: "Invalid move."};
    }
  }

  const saveBoardPosition = game => {

  }

  const addToGame = (game, user) => {
    if (viewedGames[game.id]) {
      viewedGames[game.id].includes(user.id) || viewedGames[game.id].push(user.id);
    } else {
      viewedGames[game.id] = [user.id];
    }
    
    updateGame(game, user);
    if (game.status === "wait" && game.players.list.length < 2) {
      game.players.list.push({id: user.playerId, name: user.playerName});
      user.send(JSON.stringify({type: "addPlayer", gameId: game.id}));
      game.players.list === 2 && setupGame(game);
    }
  }

  const updateGame = (game, user, playback) => {
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
      user.send(JSON.stringify({type: "updateGame", game: output, playback: (playback || null)}));
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

    // Update user count when a user connects
    /* wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "clientCount", value: wss.clients.size }));
      }
    }); */

    // Give each message a unique id and the associated user's colour
    ws.on('message', (message) => {
      message = JSON.parse(message);
      switch (message.type) {
        case "identify":
          if (!message.playerId) {
            ws.playerId = uuid();
            ws.playerName = message.playerName || "Anonymous";
            ws.send(JSON.stringify({type: "assignPlayerId", playerId: ws.playerId}));
          } else {
            ws.playerId = message.playerId;
          }
          usersOnline[ws.id].playing = message.playing;
          break;
        case "newGame":
          let game = {
            id: uuid(),
            status: "wait",
            players: {
              list: [],
              gold: null,
              silver: null
            },
            pieces: {
              gold: {R: 8, C: 2, D: 2, H: 2, M: 1, E: 1},
              silver: {r: 8, c: 2, d: 2, h: 2, m: 1, e: 1}
            },
            board: initBoard(),
            moveList: [],
            turnStartPosition: null,
            positionCount: {},
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
            makeAMove(game, ws, message.move);
          }
          break;
      }
    });

    // Set up a callback for when a client closes the socket. This usually means they closed their browser.
    ws.on('close', () => {
      console.log('Client disconnected')
      delete usersOnline[ws.id];

      // Update user count when user disconnects
      /* wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "clientCount", value: wss.clients.size }));
        }
      }); */
    });
  });
});