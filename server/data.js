"use strict";

// Save and get from db
module.exports = (db) => {
  return {
    saveGame: (gameInfo) => {
      db.collection("arimaa").insertOne(gameInfo);
    },

    getGame: (gameId) => {
      return db.collection("arimaa").findOne({id: gameId});
    }
  };
}