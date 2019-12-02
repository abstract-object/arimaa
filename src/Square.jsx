import React from 'react';

const Square = props => {
  return (
    <div className = {`${props.type === "trap" ? "trapSquare" : "blankSquare"} ${props.selected && "selected"}`}>
      {props.piece && <img src={`images/${props.piece}.png`}/>}
    </div>
  );
}
export default Square;
