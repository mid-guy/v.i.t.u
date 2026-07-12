export default function App() {
	const texts = ['alpha', 'beta'];
	const items = [{ id: 1, label: 'one' }];
	return (
		<div>
			<p r-for="text from texts">{'row'}</p>
			<span r-for="item of itemz">{'row'}</span>
		</div>
	);
}
