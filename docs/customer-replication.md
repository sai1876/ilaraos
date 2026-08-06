# IlaraOS Customer Replication Guide

For each new restaurant customer, the company replicates the codebase, connects a fresh Firebase project, configures the restaurant details, and deploys a separate instance.

## Steps to Deploy a New Customer

1. **Clone the Ilara Repository**
   Clone the `ilara-main` repository to create a fresh workspace for the new customer.

2. **Create a New Firebase Project**
   Go to the Firebase Console and create a new project dedicated solely to this restaurant.

3. **Configure Authentication**
   Enable Email/Password, Phone, and Google authentication methods in Firebase Auth.

4. **Create Firestore and Storage**
   Initialize Cloud Firestore and Firebase Storage in the new project.

5. **Copy Server and Client Firebase Environment Variables**
   Use `.env.customer.example` as a template to create `.env` or `.env.local`. Fill in the client and server Firebase Admin SDK credentials.

6. **Set Restaurant Branding and Information**
   Edit `src/config/restaurant.ts` and set the new customer's details (e.g., `restaurantName`, `contactPhone`, `currency`, `timezone`). All operations and data belong to this single restaurant.

7. **Run Database Seed/Setup**
   Run the setup script to initialize default documents.
   `npm run setup-customer`

8. **Create Owner and Manager Accounts**
   Create initial accounts for the restaurant Owner and Manager with the required permissions set in the database.

9. **Deploy to Vercel**
   Push the customized repository and deploy it to Vercel. Ensure all environment variables are added to the Vercel project settings.

10. **Optionally Build the Android Application**
    If the customer requires the Android application, use Capacitor to build the APK/AAB from the web deployment.
