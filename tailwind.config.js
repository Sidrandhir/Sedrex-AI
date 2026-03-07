module.exports = {
	content: [
		'./index.html',
		'./App.tsx',
		'./index.tsx',
		'./components/**/*.{js,ts,jsx,tsx}',
		'./services/**/*.{js,ts,jsx,tsx}',
	],
	theme: {
		extend: {
			fontFamily: {
				sans: ['IBM Plex Sans', 'sans-serif'],
				mono: ['IBM Plex Mono', 'monospace'],
			},
		},
	},
	plugins: [],
};
