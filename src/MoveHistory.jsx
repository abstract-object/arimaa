import React from 'react';

const MoveHistory = props => {
  return (
    <section>
      <ul>{props.history.map(move => {
        return <li><Move notation={move}/></li>
      })}</ul>
    </section>
  );
}
export default MoveHistory;
