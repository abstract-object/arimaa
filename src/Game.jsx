import React from 'react';

const Game = props => {
  return (
    <section>
      <Board board = {props.board}/>
      {/* <MoveHistory history = {props.moveList}/> */}
    </section>
  );
}
export default Game;
