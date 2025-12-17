const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const mongoose = require('mongoose');
const admin = require('firebase-admin'); 
const { ObjectId } = mongoose.Types; 

dotenv.config();
const app = express();

let firebaseInitialized = false;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const serviceAccountConfig = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccountConfig) });
        firebaseInitialized = true;
    } catch (e) { console.error("Firebase Error:", e.message); }
}

const allowedOrigins = ['http://localhost:5173', process.env.FRONTEND_URL, 'http://localhost:5176', 'http://127.0.0.1:5173', 'http://localhost:5175', 'http://127.0.0.1:5175', 'http://localhost:5177'];
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) callback(null, true);
        else callback(new Error('Not allowed by CORS'));
    },
    credentials: true, methods: 'GET,HEAD,PUT,PATCH,POST,DELETE'
};

app.use(cors(corsOptions));
app.use(express.json());

const verifyToken = async (req, res, next) => {
    if (!firebaseInitialized) return res.status(500).send({ message: 'Firebase not configured.' });
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).send({ message: 'Token missing' });
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken; 
        next(); 
    } catch (error) { res.status(401).send({ message: 'Invalid token' }); }
};

let isConnected = false;
const connectDB = async () => { 
    if (isConnected) return; 
    try {
        await mongoose.connect(process.env.DB_URI || 'mongodb://localhost:27017/ai_models_db'); 
        isConnected = true;
        console.log("MongoDB Connected");
    } catch (error) { console.error(error.message); }
};

const ModelSchema = new mongoose.Schema({
    modelName: { type: String, required: true },
    category: { type: String, required: true },
    name: { type: String, default: function() { return this.modelName; } }, 
    framework: { type: String, default: function() { return this.category; } }, 
    useCase: { type: String, default: 'General AI' },
    dataset: { type: String, default: 'Proprietary Data' },
    description: { type: String, required: true },
    imageUrl: { type: String, required: true },
    developerEmail: { type: String, required: true },
    developerUid: { type: String, required: true }, 
    purchased: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now } 
});
const AIModelOne = mongoose.model('AIModel', ModelSchema);

// Routes
app.get('/models', async (req, res) => {
    await connectDB();
    try {
        let query = {};
        if (req.query.email) query.developerEmail = req.query.email;
        if (req.query.category && req.query.category !== 'All') query.category = req.query.category;
        const models = await AIModelOne.find(query).sort({ createdAt: -1 }).exec();
        res.send(models);
    } catch (error) { res.status(500).send({ message: "Error" }); }
});

app.get('/models/latest', async (req, res) => {
    await connectDB();
    try {
        const limit = parseInt(req.query.limit) || 6; 
        const latest = await AIModelOne.find({}).sort({ createdAt: -1 }).limit(limit).exec();
        res.json(latest);
    } catch (error) { res.status(500).send({ message: "Error" }); }
});

app.get('/models/:id', async (req, res) => {
    await connectDB();
    try {
        if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
        const model = await AIModelOne.findById(req.params.id);
        if (!model) return res.status(404).send({ message: "Not found" });
        res.send(model);
    } catch (error) { res.status(500).send({ message: "Error" }); }
});



app.post('/purchase-model', verifyToken, async (req, res) => {
    await connectDB();
    try {
        const { modelId } = req.body;
        const buyerUid = req.user.uid; 
        if (!ObjectId.isValid(modelId)) return res.status(400).send({ message: "Invalid ID" });

        const firestore = admin.firestore();
        const historyRef = firestore.collection('purchase').doc(buyerUid).collection('history');
        
        // One-time purchase check
        const existing = await historyRef.where('modelId', '==', modelId).get();
        if (!existing.empty) return res.status(400).send({ message: "Already purchased." });

        const mongoRes = await AIModelOne.updateOne({ _id: new ObjectId(modelId) }, { $inc: { purchased: 1 } });
        if (mongoRes.modifiedCount === 0) return res.status(404).send({ message: "Failed" });
        
        const purchaseRef = historyRef.doc(); 
        await purchaseRef.set({ id: purchaseRef.id, ...req.body, buyerUid, purchaseDate: new Date().toISOString() });
        res.send({ acknowledged: true });
    } catch (error) { res.status(500).send({ message: error.message }); }
});

app.patch('/models/:id', verifyToken, async (req, res) => {
    await connectDB();
    try {
        const result = await AIModelOne.updateOne({ _id: new ObjectId(req.params.id), developerUid: req.user.uid }, { $set: req.body });
        res.send(result);
    } catch (error) { res.status(500).send({ message: "Error" }); }
});

app.delete('/models/:id', verifyToken, async (req, res) => {
    await connectDB();
    try {
        const result = await AIModelOne.deleteOne({ _id: new ObjectId(req.params.id), developerUid: req.user.uid });
        res.send(result);
    } catch (error) { res.status(500).send({ message: "Error" }); }
});

module.exports = app;