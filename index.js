const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const mongoose = require('mongoose');
const admin = require('firebase-admin'); 
const { ObjectId } = mongoose.Types; 

dotenv.config();
const app = express();

// Firebase Admin Initialization
let firebaseInitialized = false;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const serviceAccountConfig = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccountConfig) });
        firebaseInitialized = true;
        console.log("Firebase Admin Initialized");
    } catch (e) { console.error("Firebase Initialization Error:", e.message); }
}

// CORS Settings
const allowedOrigins = ['http://localhost:5173', process.env.FRONTEND_URL, 'http://localhost:5176', 'http://127.0.0.1:5173', 'http://localhost:5175', 'http://127.0.0.1:5175', 'http://localhost:5177'];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// Token Middleware
const verifyToken = async (req, res, next) => {
    if (!firebaseInitialized) return res.status(500).send({ message: 'Firebase Error' });
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).send({ message: 'No Token Provided' });
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken; 
        next(); 
    } catch (error) { res.status(401).send({ message: 'Unauthorized' }); }
};

// Database Connection
let isConnected = false;
const connectDB = async () => { 
    if (isConnected) return; 
    try {
        await mongoose.connect(process.env.DB_URI); 
        isConnected = true;
        console.log("MongoDB Connected");
    } catch (error) { console.error(error.message); }
};

// Model Schema
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

// --- Routes ---

app.get('/models', async (req, res) => {
    await connectDB();
    const query = req.query.category && req.query.category !== 'All' ? { category: req.query.category } : {};
    if (req.query.email) query.developerEmail = req.query.email;
    const models = await AIModelOne.find(query).sort({ createdAt: -1 });
    res.send(models);
});

app.get('/models/latest', async (req, res) => {
    await connectDB();
    const latest = await AIModelOne.find({}).sort({ createdAt: -1 }).limit(6);
    res.json(latest);
});

app.get('/models/:id', async (req, res) => {
    await connectDB();
    if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
    const model = await AIModelOne.findById(req.params.id);
    res.send(model || { message: "Not Found" });
});

// ✅ সংশোধিত পারচেজ রুট (Duplicate Check logic)

app.post('/purchase-model', verifyToken, async (req, res) => {
    await connectDB();
    try {
        const { modelId } = req.body;
        const buyerUid = req.user.uid; 
        
        const firestore = admin.firestore();
        const historyRef = firestore.collection('purchase').doc(buyerUid).collection('history');
        
        // ডুপ্লিকেট চেক
        const existing = await historyRef.where('modelId', '==', modelId).get();
        if (!existing.empty) return res.status(400).send({ message: "You already own this model." });

        // MongoDB আপডেট
        const mongoRes = await AIModelOne.updateOne({ _id: new ObjectId(modelId) }, { $inc: { purchased: 1 } });
        
        // Firestore সেভ
        const purchaseRef = historyRef.doc(); 
        await purchaseRef.set({ id: purchaseRef.id, ...req.body, buyerUid, purchaseDate: new Date().toISOString() });
        
        res.send({ acknowledged: true });
    } catch (error) { res.status(500).send({ message: error.message }); }
});

app.patch('/models/:id', verifyToken, async (req, res) => {
    await connectDB();
    const result = await AIModelOne.updateOne({ _id: new ObjectId(req.params.id), developerUid: req.user.uid }, { $set: req.body });
    res.send(result);
});

app.delete('/models/:id', verifyToken, async (req, res) => {
    await connectDB();
    const result = await AIModelOne.deleteOne({ _id: new ObjectId(req.params.id), developerUid: req.user.uid });
    res.send(result);
});

module.exports = app;