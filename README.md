# AI Model Inventory & Marketplace - Server Side

This is the server-side repository for the **AI Model Inventory & Marketplace** platform. Built with **Node.js, Express.js, and MongoDB**, this REST API manages secure authentication verification, AI model inventory workflows, user role management, and payment processing.

---

## 🚀 Live Links & Client Repository

* **Client Repository:** [GitHub Frontend Repository](https://github.com/mostakim8/clinet-side-ai-model-inventory-manager-ms010a010.git)
* **Live Application:** [AI Model Marketplace Live](https://dulcet-fox-ad01e1.netlify.app/app)

---

##  Key Server Features

* **Role-Based Access Control (RBAC):** Middleware for securing admin endpoints and validating distinct permissions.
* **RESTful API Architecture:** Structured endpoints to manage model categories, user inventories, and purchases.
* **Database Integration:** Optimized MongoDB collections with dynamic indexing for efficient retrieval.
* **Secure Authentication Verification:** Validates client-side tokens and protects private endpoints.
* **Payment Processing Integration:** Backend transaction endpoints configured with Stripe API.

---

## 🛠️ Tech Stack

* **Runtime:** Node.js
* **Framework:** Express.js
* **Database:** MongoDB
* **Authentication:** Firebase Admin / JWT Validation
* **Payment Gateway:** Stripe API

---

## ⚙️ Environment Variables Setup

To run this backend server locally, create a `.env` file in the root directory and add the following keys:

```env
PORT=5000
DB_USER=your_mongodb_username
DB_PASS=your_mongodb_password
STRIPE_SECRET_KEY=your_stripe_secret_key
ACCESS_TOKEN_SECRET=your_jwt_secret_key
```
## 💻 Local Setup & Installation
Clone the repository:

* Bash
* git clone [https://github.com/mostakim8/-server-side-aI-model-inventory-manager-ms010a010-.git](https://github.com/mostakim8/-server-side-aI-model-inventory-manager-ms010a010-.git)
* cd -server-side-aI-model-inventory-manager-ms010a010-
  
Install dependencies:
* Bash
* npm install
  
Start the server:
* Bash
* npm start

