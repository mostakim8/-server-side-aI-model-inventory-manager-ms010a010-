const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const mongoose = require('mongoose');
const admin = require('firebase-admin'); 
const { ObjectId } = mongoose.Types; 

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 5001; 

// 2. Firebase Admin Initialization
// Ensure serviceAccountKey.json is available in the root
const serviceAccount = require('./serviceAccountKey.json'); 

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// --- CORS Configuration (Same as provided) ---

const allowedOrigins = [
    'http://localhost:5176',
    'http://localhost:5173', 
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

// --- 3. Token Verification Middleware (Same as provided) ---
const verifyToken = async (req, res, next) => {
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


// --- MongoDB Connection & Updated Schema ---
const connectDB = async () => { 
    try {
        await mongoose.connect(process.env.DB_URI || 'mongodb://localhost:27017/ai_models_db'); 
        console.log("MongoDB connected successfully.");
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
    }
};
connectDB();

// 🔑 CRITICAL FIX: Model Schema আপডেট
const ModelSchema = new mongoose.Schema({
    // Existing fields for backward compatibility
    modelName: { type: String, required: true },
    category: { type: String, required: true },
    
    // 🛑 ফিক্স: price ফিল্ডকে optional করা হলো এবং default 0 সেট করা হলো
    price: { type: Number, required: false, default: 0 },
    
    // Assignment Required fields (Using existing fields for mapping)
    name: { type: String, default: function() { return this.modelName; } }, // Maps to modelName
    framework: { type: String, default: function() { return this.category; } }, // Maps to category
    
    // New required fields from assignment
    useCase: { type: String, default: 'General AI' },
    dataset: { type: String, default: 'Proprietary Data' },
    
    description: { type: String, required: true },
    imageUrl: { type: String, required: true },
    
    // Developer fields (createdBy, developerUid)
    developerEmail: { type: String, required: true },
    developerUid: { type: String, required: true }, 
    developerName: { type: String, required: false }, // Optional
    
    // CRITICAL FIX: Purchase Counter field added
    purchased: { type: Number, default: 0 },
    
    // Added createdAt field for sorting (Featured Models/Latest)
    createdAt: { type: Date, default: Date.now } 
});

const AIModelOne = mongoose.model('AIModel', ModelSchema);

// --- API Endpoints ---

app.get('/', (req, res) => {
    res.send('AI Model Inventory Manager Server is running!');
});

// GET /models (with filtering, and sorting for featured/latest models)
app.get('/models', async (req, res) => {
    try {
        let query = {};
        let sort = {};

        // Filter by email (My Models page uses this)
        if (req.query.email) {
            query.developerEmail = req.query.email;
        }

        // Filter by category/framework (Home page filter uses this)
        if (req.query.category && req.query.category !== 'All') {
            query.category = req.query.category;
        }
        
        // FIX: Latest 6 models logic (for Home/Featured) - Sort by creation date descending
        if (req.query.latest === 'true') {
            sort.createdAt = -1; // Newest first
        } else {
             // Default sort by price descending for general list (as implemented in client Home)
             sort.price = -1;
        }
        
        let modelsQuery = AIModelOne.find(query).sort(sort);

        // Limit to 6 models only if 'latest=true' is explicitly requested
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


app.get('/models/:id', async (req, res) => {
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

// new API endpoint: Full Purchase Transaction (MongoDB & Firestore Log)
app.post('/purchase-model', verifyToken, async (req, res) => {
    try {
        const transactionData = req.body;
        const modelId = transactionData.modelId;
        const buyerUid = req.user.uid; 
        
        // 1. Data Validation (modelId must be a valid MongoDB ObjectId)
        if (!ObjectId.isValid(modelId)) {
            return res.status(400).send({ message: "Invalid Model ID format: The string did not match the expected pattern." });
        }
        
        // 2. MongoDB: Atomically increment the 'purchased' counter
        const mongoResult = await AIModelOne.updateOne(
            { _id: new ObjectId(modelId) },
            { $inc: { purchased: 1 } }
        );

        if (mongoResult.modifiedCount === 0) {
            return res.status(404).send({ message: "Model not found or update failed." });
        }
        
        // 3. Firestore: Record the purchase transaction
        const firestore = admin.firestore();
        // Use a fallback for appId
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

        // 4. Success Response
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


// This uses the $inc operator to atomically increase the 'purchased' counter.
// NOTE: The new POST /purchase-model route above now handles this logic as well, 
// but this PATCH route is kept for backward compatibility/direct counter update.
app.patch('/models/purchase/:id', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "Invalid Model ID format." });
        }

        const result = await AIModelOne.updateOne(
            { _id: new ObjectId(id) },
            { $inc: { purchased: 1 } } // Atomically increment the purchased count
        );

        if (result.modifiedCount === 0) {
            // If modifiedCount is 0, it means the model wasn't found (if ID was valid)
            return res.status(404).send({ message: "Model not found or update failed." });
        }
        
        res.send({ acknowledged: true, modifiedCount: result.modifiedCount, message: "Purchase counter updated successfully." });

    } catch (error) {
        console.error("Error updating purchase counter:", error);
        res.status(500).send({ message: "Failed to update purchase counter." });
    }
});


// PATCH: Update a model by ID (Private - Verification and Ownership check required)
app.patch('/models/:id', verifyToken, async (req, res) => { 
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

        // --- OWNERSHIP CHECK WITH FALLBACK ---
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
        // --- END OWNERSHIP CHECK ---

        if (!isOwner) {
             return res.status(403).send({ message: "Forbidden: Only the model owner can update it." });
        }
        
        const filter = { _id: new ObjectId(id) }; 

        // Update fields including new assignment fields (if provided by client)
        const updateDoc = {
            $set: {
                modelName: updatedData.modelName,
                name: updatedData.modelName, // Sync name
                description: updatedData.description,
                
                price: updatedData.price !== undefined && updatedData.price !== null 
                       ? parseFloat(updatedData.price) 
                       : existingModel.price, 
                
                category: updatedData.category,
                framework: updatedData.category, // Sync framework
                imageUrl: updatedData.imageUrl, 
                // Note: useCase and dataset should ideally be added to client UpdateModel form
                useCase: updatedData.useCase || existingModel.useCase, 
                dataset: updatedData.dataset || existingModel.dataset,
            }
        };
        
        const result = await AIModelOne.updateOne(filter, updateDoc);
        if (result.modifiedCount === 0) {
            const updatedModel = await AIModelOne.findById(id);
            if (updatedModel) {
                 // Send back the model if no changes were made but found (common successful PATCH response)
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


// DELETE: Delete a model by ID (Private - Verification and Ownership check required)
app.delete('/models/:id', verifyToken, async (req, res) => { 
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

        // --- OWNERSHIP CHECK WITH FALLBACK ---
        if (existingModel.developerUid) {
            if (existingModel.developerUid === userUid) {
                isOwner = true;
            }
        } else if (existingModel.developerEmail === userEmail) {
            isOwner = true;
            await AIModelOne.updateOne({ _id: new ObjectId(id) }, { $set: { developerUid: userUid } });
        }
        // --- END OWNERSHIP CHECK ---

        if (!isOwner) {
            return res.status(403).send({ message: "Forbidden: Only the model owner can delete it." });
        }
        
        // Delete only if ownership passed
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


// --- Start Server ---
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});