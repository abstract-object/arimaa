import React from 'react';

Square = props => {
  return (
    <div className = {props.type === "trap" ? "trapSquare" : "blankSquare"}>
      
    </div>
  );
}
export default Square;