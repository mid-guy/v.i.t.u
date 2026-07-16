export default function App() {
	const texts = ['alpha', 'beta'];
	const items = [{ id: 1, label: 'one' }];
	return (
		<div>
			<p r-for="(text, ti) from texts">{'row'}</p>
			<span r-for="(item, ii) of itemz">{'row'}</span>
			<li r-for="(entry, i) in items">{entry.label}</li>
		</div>
	);
}
