# babel-plugin-v.i.t.u

**V.I.T.U: Vue Is That You?**

This Babel plugin introduces the `r-if` directive for conditional rendering in React components, inspired by Vue's syntax. With `r-if`, you can achieve a more streamlined and expressive syntax for conditional rendering in JSX, making it feel a bit like `Vue` in `React`.

## Table of Contents

- [Installation](#installation)
- [Setup](#setup)
- [Example](#example)
- [Changelog](#changelog)

## Installation

To install the plugin, use npm or yarn:

```bash
npm install @mg/babel-plugin-v.i.t.u
# or
yarn add @mg/babel-plugin-v.i.t.u
```

## Setup

After installing, configure Babel to use this plugin. Add it to your Babel configuration file (e.g., `.babelrc`, `babel.config.js`):

```bash
{
  "plugins": ["babel-plugin-v.i.t.u"]
}
```

## Example

Once configured, you can use the `r-if` attribute in JSX. The component with `r-if` will only render if the condition inside `r-if` evaluates to true.

**Before compiler**

```javascript
import React, { useState } from 'react';

const App = () => {
	const [isLoggedIn, setIsLoggedIn] = useState(false);

	const toggleLogin = () => {
		setIsLoggedIn((prev) => !prev);
	};

	return (
		<div>
			<h1>Welcome!</h1>
			<div r-if={isLoggedIn}>You are logged in.</div>
			<div r-if={!isLoggedIn}>Please log in.</div>
			<button onClick={toggleLogin}>{isLoggedIn ? 'Log Out' : 'Log In'}</button>
		</div>
	);
};

export default App;
```

**After compile**

```javascript
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
```

## Changelog

All notable changes to this project will be documented here.

[1.0.0] - 2024-11-03
Initial release of `babel-plugin-v.i.t.u` with experimental `r-if` directive support.
