import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Home = () => {
  const [roomName, setRoomName] = useState('');
  const navigate = useNavigate();

  const handleCreateOrJoin = (event) => {
    event.preventDefault();
    if (roomName.trim()) {
      navigate(`/call/${roomName}`);
    }
  };

  return (
    <div className="home-container">
      <h1>Video Call App</h1>
      <form onSubmit={handleCreateOrJoin}>
        <input
          type="text"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          placeholder="Enter Room Name"
          required
        />
        <button type="submit">Create/Join Call</button>
      </form>
    </div>
  );
};

export default Home;
