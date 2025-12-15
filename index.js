const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const mongoose = require('mongoose');
const admin = require('firebase-admin'); 
const { ObjectId } = mongoose.Types; 

dotenv.config();

const app = express();

// ⚠️ চূড়ান্ত সংশোধন: Firebase Admin Initialization (Vercel Optimized)
// লোকাল ফাইল ফলব্যাক সম্পূর্ণরূপে বাদ দেওয়া হয়েছে।
let firebaseInitialized = false;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        // Vercel Environment Variable থেকে JSON পার্স করে ক্রেডেনশিয়াল লোড করা হচ্ছে।
        const serviceAccountConfig = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountConfig)
        });
        firebaseInitialized = true;
        console.log("Firebase Admin initialized from Environment Variables.");
    } catch (e) {
        // যদি JSON পার্স করতে বা initialize করতে সমস্যা হয়।
        console.error("Firebase Admin Initialization FAILED (Environment Variable Error):", e.message);
    }
} else {
    // Vercel এ লোকাল ফাইল খোঁজার চেষ্টা বন্ধ করা হলো।
    console.warn("WARNING: Firebase Admin not initialized. Missing FIREBASE_SERVICE_ACCOUNT env var.");
}


// 🌐 CORS Configuration (Deployment Friendly)
// Production URL কে পরিবেশের ভেরিয়েবল থেকে নেওয়ার জন্য আপডেট করা হয়েছে
const allowedOrigins = [
    'http://localhost:5173', // লোকাল ফ্রন্টএন্ড 
    process.env.FRONTEND_URL, // Netlify/Vercel লাইভ ফ্রন্টএন্ড URL
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

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// 3. Token Verification Middleware 
// ... (আপনার verifyToken ফাংশন অপরিবর্তিত)
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


// MongoDB Connection & Updated Schema 
// ... (connectDB এবং Schema অপরিবর্তিত)
let isConnected = false;

const connectDB = async () => { 
    if (isConnected) return; // Already connected

    try {
        await mongoose.connect(process.env.DB_URI || 'mongodb://localhost:27017/ai_models_db'); 
        isConnected = true;
        console.log("MongoDB connected successfully.");
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        isConnected = false;
        // throw error; 
    }
};

// Mongoose Schema (unchanged)
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
    developerName: { type: String, required: false }, 
    
    purchased: { type: Number, default: 0 },
    
    createdAt: { type: Date, default: Date.now } 
});

const AIModelOne = mongoose.model('AIModel', ModelSchema);

// ------------------- ROUTES -------------------
// ... (সকল routes অপরিবর্তিত)

app.get('/', (req, res) => {
    res.send('AI Model Inventory Manager Server is running!');
});

app.get('/models', async (req, res) => {
    await connectDB();
    try {
        let query = {};
        let sort = {};

        if (req.query.email) {
            query.developerEmail = req.query.email;
        }

        if (req.query.category && req.query.category !== 'All') {
            query.category = req.query.category;
        }
        
        if (req.query.latest === 'true') {
            sort.createdAt = -1; // Newest first
        } else {
             // 💡 price ফিল্ড না থাকায় default সর্টিং createdAt দিয়ে করা হলো
             sort.createdAt = -1;
        }
        
        let modelsQuery = AIModelOne.find(query).sort(sort);

        if (req.query.latest === 'true') {
            modelsQuery = modelsQuery.limit(6);
        }

        const models = await modelsQuery.exec();
        res.send(models);
    } catch (error) {
        console.error("Error fetching models:", error);
        res.status(500).send({ message: "Failed to fetch models." });
    }
});

app.get('/models/latest', async (req, res) => {
    await connectDB();
    try {
        // 💡 skipCount 3 এর পরিবর্তে 0 ব্যবহার করা হলো, যাতে লেটেস্ট মডেলগুলো স্লাইডারে দেখা যায়
        const skipCount = parseInt(req.query.skip) || 0; 
        const limit = parseInt(req.query.limit) || 6; 
        
        const latestModels = await AIModelOne.find({})
            .sort({ createdAt: -1 }) 
            .skip(skipCount)
            .limit(limit)
            .exec();
            
        res.status(200).json(latestModels);
    } catch (error) {
        console.error("Error fetching latest models:", error);
        res.status(500).send({ message: "Failed to fetch latest models due to server error." });
    }
});

app.get('/models/:id', async (req, res) => {
    await connectDB();
    try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "Invalid Model ID format." });
        }
        const model = await AIModelOne.findById(id);
        if (!model) {
            return res.status(404).send({ message: "Model not found." });
        }
        res.send(model);
    } catch (error) {
        console.error("Error fetching single model:", error);
        res.status(500).send({ message: "Failed to fetch model." });
    }
});


app.post('/models', verifyToken, async (req, res) => { 
    await connectDB();
    try {
        const newModelData = req.body;
        
        if (newModelData.developerEmail !== req.user.email) {
            return res.status(403).send({ message: "Forbidden: Developer email mismatch." });
        }

        newModelData.developerUid = req.user.uid; 
        
        
        if (newModelData.price !== undefined) {
             newModelData.price = parseFloat(newModelData.price);
        } else {
             delete newModelData.price; 
        }

        const newModel = new AIModelOne(newModelData);
        const result = await newModel.save();
        res.status(201).send(result);
    } catch (error) {
        console.error("Error creating model:", error.message);
        res.status(400).send({ message: `Failed to create model: ${error.message}` });
    }
});


app.post('/purchase-model', verifyToken, async (req, res) => {
    await connectDB();
    try {
        const transactionData = req.body;
        const modelId = transactionData.modelId;
        const buyerUid = req.user.uid; 
        
        if (!ObjectId.isValid(modelId)) {
            return res.status(400).send({ message: "Invalid Model ID format: The string did not match the expected pattern." });
        }
        
        const mongoResult = await AIModelOne.updateOne(
            { _id: new ObjectId(modelId) },
            { $inc: { purchased: 1 } }
        );

        if (mongoResult.modifiedCount === 0) {
            return res.status(404).send({ message: "Model not found or update failed." });
        }
        
       
        const firestore = admin.firestore();
        const appId = process.env.FIREBASE_APP_ID || 'default-app-id'; 
        const purchaseRef = firestore
                            .collection(`artifacts/${appId}/users/${buyerUid}/purchases`)
                            .doc(); 
        
        const purchaseRecord = {
            id: purchaseRef.id, 
            ...transactionData,
            buyerUid: buyerUid, 
            purchaseDate: new Date().toISOString(),
        };

        await purchaseRef.set(purchaseRecord);

        res.send({ 
            acknowledged: true, 
            message: `Purchase successful. Model count updated: ${mongoResult.modifiedCount}. Transaction logged.`,
            purchaseRecord 
        });

    } catch (error) {
        console.error('Purchase Transaction Failed:', error);
        res.status(500).send({ message: `Transaction Failed: ${error.message}` });
    }
});

app.patch('/models/purchase/:id', verifyToken, async (req, res) => {
    await connectDB();
    try {
        const id = req.params.id;
        
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "Invalid Model ID format." });
        }

        const result = await AIModelOne.updateOne(
            { _id: new ObjectId(id) },
            { $inc: { purchased: 1 } } 
        );

        if (result.modifiedCount === 0) {
            
            return res.status(404).send({ message: "Model not found or update failed." });
        }
        
        res.send({ acknowledged: true, modifiedCount: result.modifiedCount, message: "Purchase counter updated successfully." });

    } catch (error) {
        console.error("Error updating purchase counter:", error);
        res.status(500).send({ message: "Failed to update purchase counter." });
    }
});

app.patch('/models/:id', verifyToken, async (req, res) => { 
    await connectDB();
    try {
        const id = req.params.id;
        const updatedData = req.body;
        const userUid = req.user.uid; 
        const userEmail = req.user.email; 
        
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "Invalid Model ID format." });
        }

        const existingModel = await AIModelOne.findById(id);
        if (!existingModel) {
            return res.status(404).send({ message: "Model not found." });
        }

        let isOwner = false;

        if (existingModel.developerUid) {
            if (existingModel.developerUid === userUid) {
                isOwner = true;
            }
        } else {
            if (existingModel.developerEmail === userEmail) {
                isOwner = true;
                await AIModelOne.updateOne({ _id: new ObjectId(id) }, { $set: { developerUid: userUid } });
            }
        }

        if (!isOwner) {
             return res.status(403).send({ message: "Forbidden: Only the model owner can update it." });
        }
        
        const filter = { _id: new ObjectId(id) }; 

        const updateDoc = {
            $set: {
                modelName: updatedData.modelName,
                name: updatedData.modelName, 
                description: updatedData.description,
                
                // 💡 price ফিল্ড না থাকলেও এটি সঠিক
                price: updatedData.price !== undefined && updatedData.price !== null 
                       ? parseFloat(updatedData.price) 
                       : existingModel.price, 
                
                category: updatedData.category,
                framework: updatedData.category,
                imageUrl: updatedData.imageUrl, 
                useCase: updatedData.useCase || existingModel.useCase, 
                dataset: updatedData.dataset || existingModel.dataset,
            }
        };
        
        const result = await AIModelOne.updateOne(filter, updateDoc);
        if (result.modifiedCount === 0) {
            const updatedModel = await AIModelOne.findById(id);
            if (updatedModel) {
                 return res.send(updatedModel); 
            }
            return res.status(404).send({ message: "Update failed or model not found." });
        }
        
        const updatedModel = await AIModelOne.findById(id);
        res.send(updatedModel);

    } catch (error) {
        console.error("Error updating model:", error);
        res.status(500).send({ message: "Failed to update model." });
    }
});

app.delete('/models/:id', verifyToken, async (req, res) => { 
    await connectDB();
    try {
        const id = req.params.id;
        const userUid = req.user.uid; 
        const userEmail = req.user.email;
        
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "Invalid Model ID format." });
        }

        const existingModel = await AIModelOne.findById(id);
        if (!existingModel) {
            return res.status(404).send({ message: "Model not found." });
        }

        let isOwner = false;

        if (existingModel.developerUid) {
            if (existingModel.developerUid === userUid) {
                isOwner = true;
            }
        } else if (existingModel.developerEmail === userEmail) {
            isOwner = true;
            await AIModelOne.updateOne({ _id: new ObjectId(id) }, { $set: { developerUid: userUid } });
        }

        if (!isOwner) {
            return res.status(403).send({ message: "Forbidden: Only the model owner can delete it." });
        }
        
        const result = await AIModelOne.deleteOne({ _id: new ObjectId(id) }); 

        if (result.deletedCount === 0) {
            return res.status(404).send({ message: "Delete failed or model not found." });
        }
        res.send({ acknowledged: true, deletedCount: result.deletedCount });

    } catch (error) {
        console.error("Error deleting model:", error);
        res.status(500).send({ message: "Failed to delete model." });
    }
});

// ------------------- VERCEL EXPORT -------------------
module.exports = app;