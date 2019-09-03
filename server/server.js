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
  const usersOnline = new Map();
  const viewedGames = new Map();

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

    viewedGames.get(game.id).forEach(id => {
      updateGame(game, usersOnline.get(id));
    });
  }

  const makeAMove = (game, player, action) => {
    let newBoard = Object.assign({}, game.board);
    let error = null;
    let endMove = false;
    let locations = [];
    let playback = null;
    
    switch (action.type) {
      case "setup":
        let pieces = {};  
        for (let move of action.moves) {
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
              canPull: [],
              movesRemaining: 4
            };
            
            locations.push(move.destination);
          } else {
            error = `You cannot place ${move.piece} at ${move.destination}.`;
            break;
          }
        };
      
        Object.values(game.pieces[game.turnPlayer]).forEach(remaining => {
          remaining === 0 || (error = "This is not a valid starting board.");
        });

        if (!error) {
          game.pieces = pieces, game.board = newBoard;
          GameLogic.updateMovedAndAdjacentPieces(game, locations);
          endMove = true;
        }
        break;
      case "play":
        let remaining = game.movesRemaining;
        if (remaining === 4) {
          game.turnStartPosition = Object.assign({}, game.board);
        }

        currentPlayback = GameLogic.verifyMove(game, action.move, remaining);

        if (currentPlayback) {
          if (action.move.type === ("push" || "pull")) {
            remaining -= 2;
          } else if (action.move.type === "move") {
            remaining -= 1;
          } else {
            error = "Unrecognized input.";
            break;
          }

          for (let piece of currentPlayback) {
            for (let [start, end] of Object.entries(piece)) {
              locations.includes(start) || locations.push(start);
              locations.includes(end) || locations.push(end);
            }
          }

          GameLogic.updateMovedAndAdjacentPieces(game, locations);

          playback = playback.concat(currentPlayback);
        } else {
          error = "That is an invalid move.";
        }
        if (remaining < 1 || action.move.type === "finishMove") {
          endMove = true;
          if (game.board === game.turnStartPosition) {
            error = "You have made no change to the state of the board after your turn.";
          }
        }
        break;
      case "resetTurn":
        let savedGame = DataHelpers.getGame(game.id);
        updateGame(savedGame, player);
        break;
      case "resign":
        if (game.turnPlayer = "silver") {
          game.winner = "gold";
        } else {
          game.winner = "silver";
        }
        break;
    }

    if (!error && endMove) {
      if (game.turnPlayer = "silver") {
        game.turnPlayer = "gold";
        game.turnCount += 1;
        (game.status === "setup" && turnCount > 0) && (game.status = "playing");
      } else {
        game.turnPlayer = "silver";
      }
      game.movesRemaining = 4;
      game.board = newBoard;
      
      viewedGames.get(game.id).forEach(id => {
        updateGame(game, usersOnline.get(id), playback);
      });

      DataHelpers.saveGame(game);
    } else if (error) {
      player.send(JSON.stringify({type: "error", error: error}));
    } else {
      updateGame(game, player);
    }
    
  }

  const addToGame = (game, user) => {
    if (viewedGames.has(game.id)) {
      viewedGames.get(game.id).includes(user.id) || viewedGames.get(game.id).push(user.id);
    } else {
      viewedGames.get(game.id) = [user.id];
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

    if (viewedGames.get(game.id).includes(user.id)) {
      user.send(JSON.stringify({type: "updateGame", game: output, playback: (playback || null)}));
    } else {
      if (viewedGames.get(game.id).size <= 1) {
        viewedGames.delete(game.id);
      } else {
        viewedGames.get(game.id).splice(viewedGames.get(game.id).indexOf(user.id), 1);
      }
    }
  }

  // Set up a callback that will run when a client connects to the server
  // When a client connects they are assigned a socket, represented by
  // the ws parameter in the callback.
  wss.on('connection', (ws) => {
    console.log('Client connected');
    ws.id = uuid();
    usersOnline.set(ws.id, ws);

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
          usersOnline.get(ws.id).playing = message.playing;
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
          game.winner = GameLogic.checkImmobility(game, game.pieces.filter(value => {
            return value.colour === game.turnPlayer;
          }));

          if (!game.winner && game.players[turnPlayer] === message.playerId) {
            makeAMove(game, ws, message.action);
          }

          game.winner = checkThreefoldRepetition(game);
          if (!game.winner) {
            game.winner = checkRabbitWin(game, game.pieces.filter(value => {
              return value.type.toLowerCase() === "r";
            }))
          }

          if (game.winner) {
            game.status = "won";
            DataHelpers.saveGame(game);

            viewedGames.get(game.id).forEach(id => {
              updateGame(game, usersOnline.get(id), playback);
            });
          }
          break;
      }
    });

    // Set up a callback for when a client closes the socket. This usually means they closed their browser.
    ws.on('close', () => {
      console.log('Client disconnected')
      usersOnline.delete(ws.id);

      // Update user count when user disconnects
      /* wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "clientCount", value: wss.clients.size }));
        }
      }); */
    });
  });
});