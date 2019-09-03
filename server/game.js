"use strict";

// Functions related to enforcing the rules of the game
module.exports = () => {
  return {
    findAdjacentSquares: location => {
      let left = (String.fromCharCode(location[0]) > "a" ? (String.fromCharCode(location[0] - 1) + location[1]) : null);
      let right = (String.fromCharCode(location[0]) < "h" ? (String.fromCharCode(location[0] + 1) + location[1]) : null);
      let up = (location[1] < 8 ? (String.fromCharCode(location[0]) + (location[1] + 1)) : null);
      let down = (location[1] > 1 ? (String.fromCharCode(location[0]) + (location[1] - 1)) : null);
  
      return [left, right, up, down];
    },
  
    adjacentToAlly: (piece, adjacentSquares) => {
      for (let location of adjacentSquares) {
        if (location && game.pieces[location].colour === piece.colour) return true;
      }
      return false;
    },
  
    adjacentToStrongerEnemies: (piece, adjacentSquares) => {
      let output = [];
      for (let location of adjacentSquares) {
        if (location && game.pieces[location].colour !== piece.colour && game.pieces[location].strength > piece.strength) output.push(location);
      }
      return output;
    },
  
    updateMovedAndAdjacentPieces: (game, locations) => {
      // Check for captures first
      let traps = locations.filter(value => {
        return value[0] === ("c" || "f") && value[1] === ("3" || "6") && game.pieces[value];
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
        let piece = game.pieces[location] || null;
        // Make sure the adjacent squares checked are not out of bounds
        let adjacentSquares = findAdjacentSquares(location);
        allAffectedPieces = allAffectedPieces.concat(adjacentSquares.filter(value => {
          return allAffectedPieces.indexOf(value) < 0 && game.pieces[value];
        }));
        
        if (piece) {
          // Check for adjacent allies and stronger enemies
          let isAdjacentToAlly = adjacentToAlly(piece, adjacentSquares);
          let adjacentStrongerEnemies = adjacentToStrongerEnemies(piece, adjacentSquares);
  
          piece.canMoveTo = [];
          piece.canBePushedTo = [];

          // Check if adjacent to stronger enemy piece and not adjacent to ally; if so, piece is frozen
          if (adjacentStrongerEnemies.length > 0 && !isAdjacentToAlly) {
            piece.isFrozen = true;
          } else {
            piece.isFrozen = false;
          }
  
          // Check possible destination squares for movement
          adjacentSquares.forEach(value => {
            if (!game.pieces[value]) {
              if (!piece.isFrozen && !((game.pieces[piece].type === "R" && value.indexOf === 3) || (game.pieces[piece].type === "r" && value.indexOf === 4))) {
                piece.canMoveTo.push(value);
              }
              piece.canBePushedTo.push(value);
            }
          })
        }
      }
  
      for (let location of allAffectedPieces) {
        let piece = game.pieces[location];
        piece.canPush = [];
        piece.canPull = [];
      }
  
      for (let location of allAffectedPieces) {
        let piece = game.pieces[location];
        let adjacentSquares = findAdjacentSquares(location);
        let adjacentStrongerEnemies = adjacentToStrongerEnemies(piece, adjacentSquares);
  
        // Note if piece is pushable or pullable
        adjacentStrongerEnemies.forEach(enemy => {
          let enemyPiece = game.pieces[enemy];
          if (!enemyPiece.isFrozen && piece.canBePushedTo.length > 0) {
            enemyPiece.canPush.push(location);
          }
          if (enemyPiece.canMoveTo.length > 0) {
            enemyPiece.canPull.push(location);
          }
        })
      }
    },

    verifyMove: (game, move, remaining) => {
      switch (move.type) {
        case move:
          if (game.pieces[move.piece].canMoveTo.includes(move.destination) && game.pieces[move.piece].colour === game.turnPlayer) {
            let playback = [{start: move.piece, end: move.destination}];

            game.pieces[move.destination] = Object.assign({}, game.pieces[move.piece]);
            delete game.pieces[move.piece];
            game.board[move.destination].piece = game.pieces[move.destination].type;
            game.board[move.piece].piece = null;
            
            return playback;
          }
        case pull:
          if (remaining > 1 &&
          game.pieces[move.pullingPiece].canMoveTo.includes(move.pullingDestination) && 
          game.pieces[move.pullingPiece].canPull.includes(move.pulledPiece) &&
          game.pieces[move.pullingPiece].colour === game.turnPlayer) {
            let playback = [{start: move.pullingPiece, end: move.pullingDestination},
            {start: move.pulledPiece, end: move.pullingPiece}];

            game.pieces[move.pullingDestination] = Object.assign({}, game.pieces[move.pullingPiece]);
            game.pieces[move.pullingPiece] = Object.assign({}, game.pieces[move.pulledPiece]);
            delete game.pieces[move.pulledPiece];
            game.board[move.pullingDestination] = game.pieces[move.pullingDestination].piece.type;
            game.board[move.pullingPiece] = game.pieces[move.pullingPiece].piece.type;
            game.board[move.pulledPiece].piece = null;
            
            return playback;
          }
        case push:
          if (remaining > 1 &&
          game.pieces[move.pushedPiece].canBePushedTo.includes(move.pushedDestination) &&
          game.pieces[move.pushingPiece].canPush.includes(game.pieces[move.pushedPiece]) &&
          game.pieces[move.pushingPiece].colour === game.turnPlayer) {
            let playback = [{start: move.pushedPiece, end: move.pushedDestination},
              {start: move.pushingPiece, end: move.pushedPiece}];

            game.pieces[move.pushedDestination] = Object.assign({}, game.pieces[move.pushedPiece]);
            game.pieces[move.pushedPiece] = Object.assign({}, game.pieces[move.pushingPiece]);
            delete game.pieces[move.pushingPiece];
            game.board[move.pushedDestination] = game.pieces[move.pushedDestination].piece.type;
            game.board[move.pushedPiece] = game.pieces[move.pushedPiece].piece.type;
            game.board[move.pushingPiece].piece = null;
            
            return playback;
          }
        default:
          return null;
      }
    },
  
    checkRabbitWin: (game, rabbits) => {
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
    },
  
    checkThreefoldRepetition: game => {
      if (game.positionCount[JSON.stringify({board: game.board, player: game.turnPlayer})] > 2) {
        if (game.turnPlayer === "gold") {
          return "silver";
        } else {
          return "gold";
        }
      } else {
        return null;
      }
    },
  
    checkImmobility: (game, ownPieces) => {
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
  };
}