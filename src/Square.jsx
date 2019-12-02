import React from 'react';

Square = props => {
  return (
    <div className = {`${props.type === "trap" ? "trapSquare" : "blankSquare"} ${props.selected && "selected"}`}>
      {props.piece && <img src={`images/${props.piece}.png`}/>}
    </div>
  );
}
export default Square;
