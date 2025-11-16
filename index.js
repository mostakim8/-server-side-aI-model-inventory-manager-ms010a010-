const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const mongoose = require('mongoose');

// import Mongoose-ObjectId 
const { ObjectId } = mongoose.Types; 

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 5001; 

// Middleware
app.use(cors());
app.use(express.json());

// --- MongoDB Connection ---
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.DB_URI);
        console.log("MongoDB Connected Successfully!");
    } catch (error) {
        console.error("MongoDB Connection Failed:", error.message);
        process.exit(1);
    }
};
connectDB();

// --- Mongoose Schema & Model ---
const ModelSchema = new mongoose.Schema({
    modelName: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String, required: true },
    imageUrl: { type: String, required: true },
    developerEmail: { type: String, required: true },
    developerName: { type: String, required: false },
});

const AIModelOne = mongoose.model('AIModel', ModelSchema);


// --- API Endpoints ---

app.get('/', (req, res) => {
    res.send('AI Model Inventory Manager Server is running!');
});

// 1. GET: Get all models
app.get('/models', async (req, res) => {
    try {
        const query = req.query.email ? { developerEmail: req.query.email } : {};
        const models = await AIModelOne.find(query);
        res.send(models);
    } catch (error) {
        console.error("Error fetching models:", error);
        res.status(500).send({ message: "Failed to fetch models.", error: error.message });
    }
});

// 2. GET: Get a single model by ID
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
        console.error("Error fetching model:", error);
        res.status(500).send({ message: "Failed to fetch model.", error: error.message });
    }
});


// 3. POST: Add a new model
app.post('/models', async (req, res) => {
    try {
        const newModelData = req.body;
        const newModel = new AIModelOne(newModelData);
        const result = await newModel.save();
        res.status(201).send(result);
    } catch (error) {
        if (error.name === 'ValidationError') {
             res.status(400).send({ message: "Validation failed.", error: error.message });
        } else {
             console.error("Error adding model:", error);
             res.status(500).send({ message: "Failed to add model.", error: error.message });
        }
    }
});

// 4. PATCH: Update a model by ID 
app.patch('/models/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const updatedData = req.body;
        
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "Invalid Model ID format." });
        }

        const filter = { _id: new ObjectId(id) };

        const updateDoc = {
            $set: {
                modelName: updatedData.modelName,
                description: updatedData.description,
                price: updatedData.price,
                category: updatedData.category,
                imageUrl: updatedData.imageUrl, 
            }
        };
        
        const result = await AIModelOne.updateOne(filter, updateDoc);

        if (result.matchedCount === 0) {
             return res.status(404).send({ message: "Model not found." });
        }
        
        res.send({ 
            modifiedCount: result.modifiedCount,
            matchedCount: result.matchedCount,
            message: result.modifiedCount > 0 ? "Model successfully updated." : "Model data matched, but no changes were applied."
        });

    } catch (error) {
        console.error("Error updating model:", error);
        res.status(500).send({ message: "Failed to update model.", error: error.message });
    }
});


// 5. DELETE: Delete a model by ID (FIXED)
app.delete('/models/:id', async (req, res) => {
    try {
        const id = req.params.id;
        
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "Invalid Model ID format." });
        }
        
        // Use deleteOne with Mongoose ObjectId
        const result = await AIModelOne.deleteOne({ _id: new ObjectId(id) }); 

        if (result.deletedCount === 0) {
            return res.status(404).send({ message: "Model not found." });
        }
        
        res.send({ deletedCount: result.deletedCount, message: "Model successfully deleted." });

    } catch (error) {
        console.error("Error deleting model:", error);
        res.status(500).send({ message: "Failed to delete model.", error: error.message });
    }
});


// --- Start Server ---
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});