import React, { useState } from 'react';

export default function App() {
	const [isLoggedIn, setIsLoggedIn] = useState(false);
	const items = [{ message: 'Foo' }, { message: 'Bar' }];
	const users = [{ id: 1, name: 'An' }, { id: 2, name: 'Binh' }];
	const userz = [{ id: 1, name: 'An' }, { id: 2, name: 'Binh' }];
	const parentMessage = 'Parent';

	return (
		<div>
			{/* Hover `item`/`index`, type `item.` in the element body */}
			<li r-for="(item, index) in items">
				{parentMessage} - {index} - {item.message}
			</li>

			{/* Wrong variable name -> red squiggle right inside the string */}
			<span r-for="(user, i) of userz">{'row'}</span>

			{/* Malformed r-for -> the whole string is underlined in red */}
			<span r-for="user in users">{'row'}</span>

			{/* r-if / r-else: the condition must be a boolean */}
			<p r-if={isLoggedIn}>You are signed in</p>
			<p r-else>Please sign in</p>

			{/* Not a boolean -> "r-if expects a boolean" */}
			<p r-if={parentMessage}>{'x'}</p>
			<p r-show={parentMessage}>{'x'}</p>

			{/* r-else not directly after r-if -> red squiggle */}
			<p r-else>{'orphan'}</p>

			{/* r-if / r-show on the same element as r-for: loop bindings are visible */}
			<li r-for="(user, i) in users" r-if={user.id > 1} r-show={i % 2 === 0}>
				{user.name}
			</li>
	
			<button onClick={() => setIsLoggedIn((prev) => !prev)}>
				{isLoggedIn ? 'Sign out' : 'Sign in'}
			</button>
		</div>
	);
}
