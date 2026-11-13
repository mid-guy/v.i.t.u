import React, { useState } from 'react';

const App = () => {
	const [isLoggedIn, setIsLoggedIn] = useState(false);
	const toggleLogin = () => setIsLoggedIn((prev) => !prev);
	const [items] = useState([{ message: 'Foo' }, { message: 'Bar' }]);
	const parentMessage = 'Parent';

	return (
		<div>
			<h1>Welcome!</h1>
			<ul>
				<li r-for="(item, index) in items">
					{parentMessage} - {index} - {item.message}
				</li>
			</ul>
			<div>
				<div r-if={isLoggedIn}>You are signed in</div>
				<div r-else>Please sign in</div>
			</div>
			<div r-show={isLoggedIn}>Your account details</div>
			<button onClick={toggleLogin}>
				{isLoggedIn ? 'Sign out' : 'Sign in'}
			</button>
		</div>
	);
};

export default App;
