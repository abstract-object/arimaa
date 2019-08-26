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
    (move.rank >= 1 && move.rank <= 8 && move.file >= "a" && move.file <= "h" && !game.board[move.rank + move.file].piece && pieces[move.piece]) || (valid = false);
    
    switch (moves.type) {
      case "setup":
        let pieces = {};  
        moves.forEach(move => {
          if (game.status === "setup" && (game.turnPlayer === "gold" && move.rank < 3 && move.piece === move.piece.toUpperCase()) || (game.turnPlayer === "silver" && move.rank > 6 && move.piece === move.piece.toLowerCase())) {
            game.pieces[game.turnPlayer][move.piece] -= 1;
            newBoard[move.file + move.rank].piece = move.piece;

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

            pieces[move.file + move.rank] = {colour: game.turnPlayer, type: move.piece, strength: strength, previousLocation: null, isFrozen: false, canMoveTo: [], canPush: [], canBePushedBy: [], canPull: [], canBePulledTo: null, hasPushed: false};

          } else {
            valid = false;
          }
        });
      
        Object.values(game.pieces[game.turnPlayer]).forEach(remaining => {
          remaining === 0 || (valid = false);
        });

        valid && (game.pieces = pieces, game.board = newBoard);
        break;
      case "playing":
        break;
      case "resetTurn":
        let savedGame = DataHelpers.getGame(game.id);
        updateGame(savedGame, player);
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

  const findAdjacentSquares = location => {
    let left = (String.fromCharCode(location[0]) > "a" ? (String.fromCharCode(location[0] - 1) + location[1]) : null);
    let right = (String.fromCharCode(location[0]) < "h" ? (String.fromCharCode(location[0] + 1) + location[1]) : null);
    let up = (location[1] < 8 ? (String.fromCharCode(location[0]) + (location[1] + 1)) : null);
    let down = (location[1] > 1 ? (String.fromCharCode(location[0]) + (location[1] - 1)) : null);

    return [left, right, up, down];
  }

  const adjacentToAlly = (piece, adjacentSquares) => {
    for (let location of adjacentSquares) {
      if (location && game.pieces[location].colour === piece.colour) return true;
    }
    return false;
  }

  const adjacentToStrongerEnemies = (piece, adjacentSquares) => {
    let output = [];
    for (let location of adjacentSquares) {
      if (location && game.pieces[location].colour !== piece.colour && game.pieces[location].strength > piece.strength) output.push(location);
    }
    return output;
  }

  const updateMovedAndAdjacentPieces = (game, locations) => {
    // Check for captures first
    let traps = locations.filter(value => {
      return value === ("c" || "f") + ("3" || "6");
    })

    for (let location of traps) {
      let adjacentSquares = findAdjacentSquares(location);
      let isAdjacentToAlly = adjacentToAlly(game.pieces[location], adjacentSquares);

      if (!isAdjacentToAlly) {
        delete game.pieces[location];
        game.board[location].piece = null;
      }
    }

    let allAffectedPieces = [...locations];

    for (let location of locations) {
      let piece = game.pieces[location];
      // Make sure the adjacent squares checked are not out of bounds
      let adjacentSquares = findAdjacentSquares(location);
      allAffectedPieces = allAffectedPieces.concat(adjacentSquares.filter(value => {
        return allAffectedPieces.indexOf(value) < 0;
      }));
      
      // Check for adjacent allies and stronger enemies
      let isAdjacentToAlly = adjacentToAlly(piece, adjacentSquares);
      let adjacentStrongerEnemies = adjacentToStrongerEnemies(piece, adjacentSquares);

      // Check if adjacent to stronger enemy piece and not adjacent to ally; if so, piece is frozen
      if (adjacentStrongerEnemies.length > 0 && !isAdjacentToAlly) {
        piece.isFrozen = true;
      } else {
        piece.isFrozen = false;
      }

      // Check possible destination squares
      if (!piece.isFrozen) {
        adjacentSquares.forEach(value => {
          (!game.pieces[value]) && piece.canMoveTo.push(value);
        })
      }
    }

    for (let location of allAffectedPieces) {
      let piece = game.pieces[location];
      let adjacentSquares = findAdjacentSquares(location);
      let adjacentStrongerEnemies = adjacentToStrongerEnemies(piece, adjacentSquares);

      // Note if piece is pushable or pullable
      adjacentStrongerEnemies.forEach(enemy => {
        let enemyPiece = game.pieces[enemy];
        if (!enemyPiece.isFrozen && piece.canMoveTo.length > 0) {
          piece.canBePushedBy.push(enemy);
          enemyPiece.canPush.push(location);
        }
        if (enemyPiece.canMoveTo.length > 0) {
          enemyPiece.canPull.push(location);
        }
      })
    }
  }

  const checkRabbitWin = (game, rabbits) => {
    // Keep track if rabbits of either side exist; own rabbits are first, then enemy
    let ownRabbitExists = (rabbits[0].length > 0 ? true : false);
    let enemyRabbitExists = (rabbits[1].length > 0 ? true : false);

    if (!enemyRabbitExists) return game.turnPlayer;
    if (!ownRabbitExists) return game.pieces[rabbits[1][0]].colour;

    for (let colour of rabbits) {
      for (let location of colour) {
        let piece = game.pieces[location];
        // Check if rabbit on goal at end of move
        if (game.board[location].type === piece.colour + "Goal") {
          return piece.colour;
        }
      }
    }

    return null;
  }

  const checkImmobility = (game, ownPieces) => {
    let immobilized = true;

    for (let location of ownPieces) {
      if (game.pieces[location].colour === game.turnPlayer && (!game.pieces[location].isFrozen && (game.pieces[location].canMoveTo.length > 0 || game.pieces[location].canPush.length > 0))) {
        immobilized = false;
        break;
      }
    }

    if (immobilized) {
      if (game.turnPlayer === "gold") {
        return "silver";
      } else {
        return "gold";
      }
    } else {
      return null;
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
            positionCount: {},
            turnCount: 0,
            turnPlayer: "gold",
            movesRemaining: 4,
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
            makeAMove(game, ws, message.move)
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