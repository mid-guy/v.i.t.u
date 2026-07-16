import React, { useState } from 'react';

const App = () => {
	const [isLoggedIn, setIsLoggedIn] = useState(false);
	const toggleLogin = () => setIsLoggedIn((prev) => !prev);
	const [items] = useState([{ message: 'Foo' }, { message: 'Bar' }]);
	const parentMessage = 'Parent';

	return (
		<div>
			<h1>Chào mừng!</h1>
			<ul>
				<li r-for="(item, index) in items">
					{parentMessage} - {index} - {item.message}
				</li>
			</ul>
			<div>
				<div r-if={isLoggedIn}>Bạn đã đăng nhập</div>
				<div r-else>Vui lòng đăng nhập</div>
			</div>
			<div r-show={isLoggedIn}>Thông tin tài khoản của bạn</div>
			<button onClick={toggleLogin}>
				{isLoggedIn ? 'Đăng xuất' : 'Đăng nhập'}
			</button>
		</div>
	);
};

export default App;
