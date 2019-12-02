import React from 'react';

const Board = (props) => {
  return (
    <div id = "board">
      {generateSquares(props.board, props.rotateBoard)}
    </div>
  );
}

const generateSquares = (board, rotateBoard) => {
  if (rotateBoard) {
    for (let i = 7; i >= 0; i--) {
      for (let rank = 8; rank > 0; rank--) {
        let fileValue = (i + 10).toString(18).toLowerCase();
        return <Square square = {board[fileValue + rank]}/>
      }
    }
  } else {
    for (let i = 0; i < 8; i++) {
      for (let rank = 1; rank < 9; rank++) {
        let fileValue = (i + 10).toString(18).toLowerCase();
        return <Square square = {board[fileValue + rank]}/>
      }
    }
  }
}
export default Board;
