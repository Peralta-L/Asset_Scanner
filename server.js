import express from 'express';
import Assets from './src/Routes/Assets.js';

const app = express();

app.use(express.json());

app.use(express.static('public'));

app.use('/', Assets);

app.listen(3000, () => console.log('Server running on http://localhost:3000'));


export default app;