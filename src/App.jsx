import React, {Component} from 'react';

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      display: "home",
      game: null
    }
  }

  componentDidMount() {
    console.log("componentDidMount <App />");
    
    this.socket = new WebSocket("ws://0.0.0.0:3001");
    this.socket.onopen = () => {
      console.log("Connected to server");
      const playerId = localStorage.getItem("playerId");
      const playerName = localStorage.getItem("playerName");
      const playing = localStorage.getItem("playing").filter(Boolean).split(" ");

      const playerInfo = {
        type: "identify",
        playerId: (playerId || null),
        playerName: (playerName || "Anonymous"),
        playing: (playing || null)
      };
      this.socket.send(JSON.stringify(playerInfo));
    };

    // Handle server data
    this.socket.onmessage = (event) => {
      const receivedData = JSON.parse(event.data);
      
      // Update user count or update message list, depending on received data's type
      switch (receivedData.type) {
        case "assignPlayerId":
          localStorage.setItem("playerId", receivedData.playerId);
          break;
        case "updateName":
          localStorage.setItem("playerName", receivedData.playerName);
          break;
        case "updateGame": 
          this.setState({game: receivedData.game, display: "game"});
          break;
        case "addPlayer":
          let playingList = localStorage.getItem("playing");
          playingList += receivedData.gameId + " ";
          localStorage.setItem("playing", playingList);
          break;
      }
    }
  }

  render() {
    return (
      <main>
        <ShowPage display = {this.state.display} game = {this.state.game}/>
      </main>
    );
  }

  ShowPage = () => {
    return ({display, ...props }) => {
      switch (display) {
        case "home":
          return <Home {...props}/>;
        case "game":
          return <Game {...props}/>;
      }
    };
  }
}
export default App;
