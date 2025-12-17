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
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountConfig)
        });
        firebaseInitialized = true;
        console.log("Firebase Admin initialized from Environment Variables.");
    } catch (e) {
        console.error("Firebase Admin Initialization FAILED:", e.message);
    }
} else {
    console.warn("WARNING: Firebase Admin not initialized.");
}

// 🌐 CORS Configuration
const allowedOrigins = [
    'http://localhost:5173',  
    process.env.FRONTEND_URL,   
    'http://localhost:5176',
    'http://127.0.0.1:5173',
    'http://localhost:5175', 
    'http://127.0.0.1:5175',
    'http://localhost:5177'
];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.use(express.json());

// Token Verification Middleware 
const verifyToken = async (req, res, next) => {
    if (!firebaseInitialized) {
        return res.status(500).send({ message: 'Server Error: Firebase Admin not configured.' });
    }
    
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ message: 'Unauthorized Access: Token missing' });
    }
    
    const token = authorization.split(' ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken; 
        next(); 
    } catch (error) {
        console.error("Token verification failed:", error);
        res.status(401).send({ message: 'Unauthorized Access: Invalid or expired token' });
    }
};

// MongoDB Connection
let isConnected = false;
const connectDB = async () => { 
    if (isConnected) return; 
    try {
        await mongoose.connect(process.env.DB_URI || 'mongodb://localhost:27017/ai_models_db'); 
        isConnected = true;
        console.log("MongoDB connected successfully.");
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        isConnected = false;
    }
};

// Mongoose Schema
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

app.get('/', (req, res) => {
    res.send('AI Model Inventory Manager Server is running!');
});

app.get('/models', async (req, res) => {
    await connectDB();
    try {
        let query = {};
        if (req.query.email) query.developerEmail = req.query.email;
        if (req.query.category && req.query.category !== 'All') query.category = req.query.category;
        
        let models = await AIModelOne.find(query).sort({ createdAt: -1 }).exec();
        res.send(models);
    } catch (error) {
        res.status(500).send({ message: "Failed to fetch models." });
    }
});

app.get('/models/:id', async (req, res) => {
    await connectDB();
    try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID." });
        const model = await AIModelOne.findById(id);
        if (!model) return res.status(404).send({ message: "Not found." });
        res.send(model);
    } catch (error) {
        res.status(500).send({ message: "Server error." });
    }
});

app.post('/models', verifyToken, async (req, res) => { 
    await connectDB();
    try {
        const newModelData = req.body;
        if (newModelData.developerEmail !== req.user.email) {
            return res.status(403).send({ message: "Email mismatch." });
        }
        newModelData.developerUid = req.user.uid; 
        const newModel = new AIModelOne(newModelData);
        const result = await newModel.save();
        res.status(201).send(result);
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
});

// 🛠️ সংশোধিত পারচেজ রুট (ডুপ্লিকেট প্রোটেকশন সহ)

app.post('/purchase-model', verifyToken, async (req, res) => {
    await connectDB();
    try {
        const transactionData = req.body;
        const modelId = transactionData.modelId;
        const buyerUid = req.user.uid; 
        
        if (!ObjectId.isValid(modelId)) {
            return res.status(400).send({ message: "Invalid Model ID format." });
        }

        const firestore = admin.firestore();

        // 🛡️ ডুপ্লিকেট চেক: Firestore এ আগে থেকে কেনা আছে কি না দেখা
        const historyRef = firestore.collection('purchase').doc(buyerUid).collection('history');
        const existingPurchase = await historyRef.where('modelId', '==', modelId).get();

        if (!existingPurchase.empty) {
            return res.status(400).send({ 
                message: "Forbidden: You have already purchased this model once." 
            });
        }
        
        // MongoDB তে কাউন্টার আপডেট
        const mongoResult = await AIModelOne.updateOne(
            { _id: new ObjectId(modelId) },
            { $inc: { purchased: 1 } }
        );

        if (mongoResult.modifiedCount === 0) {
            return res.status(404).send({ message: "Model not found." });
        }
        
        // Firestore এ রেকর্ড সেভ
        const purchaseRef = historyRef.doc(); 
        const purchaseRecord = {
            id: purchaseRef.id, 
            ...transactionData,
            buyerUid: buyerUid, 
            purchaseDate: new Date().toISOString(),
        };

        await purchaseRef.set(purchaseRecord);

        res.send({ 
            acknowledged: true, 
            message: "Purchase successful. Transaction logged.",
            purchaseRecord 
        });

    } catch (error) {
        console.error('Purchase Transaction Failed:', error);
        res.status(500).send({ message: `Transaction Failed: ${error.message}` });
    }
});

app.patch('/models/:id', verifyToken, async (req, res) => { 
    await connectDB();
    try {
        const id = req.params.id;
        const updatedData = req.body;
        const userUid = req.user.uid; 
        
        const existingModel = await AIModelOne.findById(id);
        if (!existingModel) return res.status(404).send({ message: "Not found." });

        if (existingModel.developerUid !== userUid) {
            return res.status(403).send({ message: "Forbidden: Not owner." });
        }
        
        const result = await AIModelOne.updateOne({ _id: new ObjectId(id) }, { $set: updatedData });
        res.send({ acknowledged: true, modifiedCount: result.modifiedCount });
    } catch (error) {
        res.status(500).send({ message: "Update failed." });
    }
});

app.delete('/models/:id', verifyToken, async (req, res) => { 
    await connectDB();
    try {
        const id = req.params.id;
        const userUid = req.user.uid; 
        const existingModel = await AIModelOne.findById(id);
        
        if (!existingModel) return res.status(404).send({ message: "Not found." });
        if (existingModel.developerUid !== userUid) return res.status(403).send({ message: "Not owner." });
        
        const result = await AIModelOne.deleteOne({ _id: new ObjectId(id) }); 
        res.send({ acknowledged: true, deletedCount: result.deletedCount });
    } catch (error) {
        res.status(500).send({ message: "Delete failed." });
    }
});

module.exports = app;