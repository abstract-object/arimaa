"use strict";

// Save and get from db
module.exports = (db) => {
  return {
    saveGame: (gameInfo) => {
      db.collection("arimaa").replaceOne({"id": gameInfo.id}, gameInfo, {upsert: true});
    },

    getGame: (gameId) => {
      return db.collection("arimaa").findOne({id: gameId});
    }
  };
}