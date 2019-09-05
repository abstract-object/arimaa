import React from 'react';

Game = props => {
  return (
    <section>
      <Board board = {props.board}/>
      {/* <MoveHistory history = {props.moveList}/> */}
    </section>
  );
}
export default Game;