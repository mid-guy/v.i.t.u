import React, { useState } from 'react';

const App = () => {
	const [isLoggedIn, setIsLoggedIn] = useState(false);
	const toggleLogin = () => {
		setIsLoggedIn((prev) => !prev);
	};
	return (
		<div>
			<h1>Chào mừng!</h1>
			{isLoggedIn && <div>True</div>}
			{!isLoggedIn && <div>False</div>}
			<button onClick={toggleLogin}>
				{isLoggedIn ? 'Đăng xuất' : 'Đăng nhập'}
			</button>
		</div>
	);
};

export default App;
