# Complete Deployment Guide: GitHub + Render

## Part 1: Deploying to GitHub

### Step 1: Create a GitHub Account (if you don't have one)
1. Go to [github.com](https://github.com)
2. Click "Sign up" in the top right
3. Follow the registration process
4. Verify your email address

### Step 2: Create a New Repository on GitHub
1. Log in to GitHub
2. Click the **"+"** icon in the top right corner
3. Select **"New repository"**
4. Fill in the details:
   - **Repository name**: `data-analyzer-pro` (or any name you prefer)
   - **Description**: "Flask-based data analysis web application"
   - **Visibility**: Choose "Public" (required for Render free tier)
   - **DO NOT** check "Initialize with README" (we already have files)
5. Click **"Create repository"**
6. **Copy the repository URL** shown on the next page (looks like: `https://github.com/yourusername/data-analyzer-pro.git`)

### Step 3: Initialize Git in Your Project
Open your terminal in the project folder and run:

```bash
# Navigate to your project directory
cd "/Users/moksh/Documents/MOKSH/CS/WebDev/Code/File Analyzer copy"

# Initialize git repository
git init

# Check git status (see all files)
git status
```

### Step 4: Stage and Commit Your Files
```bash
# Add all files to staging
git add .

# Verify what will be committed (should show all your files)
git status

# Create your first commit
git commit -m "Initial commit - Data Analyzer Pro"

# Rename branch to main (if needed)
git branch -M main
```

### Step 5: Connect to GitHub and Push
```bash
# Connect your local repo to GitHub (replace with YOUR repository URL from Step 2)
git remote add origin https://github.com/YOUR-USERNAME/data-analyzer-pro.git

# Verify the remote is added
git remote -v

# Push your code to GitHub
git push -u origin main
```

**If prompted for credentials:**
- Username: Your GitHub username
- Password: Use a **Personal Access Token** (not your password)
  - Create token at: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token
  - Select "repo" scope
  - Copy the token and use it as password

### Step 6: Verify Upload
1. Go to your GitHub repository URL in your browser
2. You should see all your files (app.py, requirements.txt, static/, etc.)
3. ✅ GitHub setup complete!

---

## Part 2: Deploying to Render

### Step 1: Create a Render Account
1. Go to [render.com](https://render.com)
2. Click **"Get Started for Free"** or **"Sign Up"**
3. **Recommended**: Sign up using **"GitHub"** option (makes connection easier)
4. Authorize Render to access your GitHub account
5. Complete your profile setup

### Step 2: Create a New Web Service
1. From your Render Dashboard, click the **"New +"** button (top right)
2. Select **"Web Service"** from the dropdown

### Step 3: Connect Your Repository
1. You'll see a list of your GitHub repositories
2. Find **"data-analyzer-pro"** (or whatever you named it)
3. Click **"Connect"** next to it

**If you don't see your repository:**
- Click "Configure account" on the right
- Grant Render access to the specific repository
- Return to Render and refresh

### Step 4: Configure Your Web Service

Render should auto-detect the `render.yaml` file, but verify these settings:

- **Name**: `data-analyzer-pro` (or your preferred name)
- **Region**: Choose closest to you (e.g., Oregon, Frankfurt, Singapore)
- **Branch**: `main`
- **Root Directory**: Leave blank
- **Environment**: `Python 3`
- **Build Command**: `pip install -r requirements.txt && pip install gunicorn`
- **Start Command**: `gunicorn app:app`
- **Plan**: Select **"Free"**

### Step 5: Deploy
1. Scroll down and click **"Create Web Service"**
2. Render will start building your application
3. You'll see a build log with installation progress

**Build process (takes 3-5 minutes):**
```
==> Installing dependencies
==> Building application
==> Starting service
==> Deploy successful!
```

### Step 6: Access Your Live Application
1. Once deployed, you'll see a green **"Live"** badge
2. Your app URL will be shown at the top: `https://data-analyzer-pro.onrender.com`
3. Click the URL to open your application
4. 🎉 **Your app is now live!**

### Step 7: Test Your Application
1. Open the live URL in your browser
2. Try uploading a CSV file
3. Navigate through different sections (Overview, Statistics, etc.)
4. Verify everything works correctly

---

## Important Notes

### ⚠️ Free Tier Limitations
- **Sleep Mode**: Service sleeps after 15 minutes of inactivity
  - First request after sleep takes ~30-60 seconds to wake up
  - Subsequent requests are fast
- **Memory**: 512 MB RAM limit
- **Persistence**: Data in memory (`dataframes`) is lost when service sleeps or restarts
- **Build Time**: Limited monthly build minutes

### 🔄 Making Updates After Deployment

When you make changes to your code:

```bash
# Save your changes, then:
git add .
git commit -m "Description of changes"
git push origin main
```

**Render will automatically:**
- Detect the push to GitHub
- Rebuild your application
- Deploy the new version (takes ~3-5 minutes)

### 📊 Monitoring Your App

In your Render Dashboard, you can:
- View deployment logs
- Monitor service status
- See resource usage
- Check recent deploys
- View application logs (errors, requests)

### 🔧 Troubleshooting

**If deployment fails:**
1. Check the build logs in Render dashboard
2. Common issues:
   - Missing dependencies in `requirements.txt`
   - Python version mismatch
   - Port binding issues
3. Fix the issue locally, commit, and push again

**If the app doesn't load:**
1. Check Render logs for errors
2. Ensure your app runs locally first: `python app.py`
3. Verify all files were pushed to GitHub

**Free tier performance tips:**
- Keep uploaded files under 10 MB
- The app is great for demos and testing
- For production use, consider upgrading to a paid plan

---

## Next Steps (Optional)

### Add a Custom Domain
1. In Render dashboard → your service → Settings
2. Scroll to "Custom Domains"
3. Click "Add Custom Domain"
4. Follow DNS configuration instructions

### Upgrade for Better Performance
- **Starter Plan** ($7/month): No sleep, better performance
- **Standard Plan** ($25/month): More resources, autoscaling

### Add Environment Variables
If you need API keys or secrets:
1. Go to your service → Environment
2. Add environment variables
3. Access in Python: `os.environ.get('VARIABLE_NAME')`

---

## Summary

✅ **What you accomplished:**
1. Pushed your code to GitHub
2. Deployed a live web application on Render
3. Your app is accessible worldwide at your Render URL

🎯 **Your live app**: `https://YOUR-SERVICE-NAME.onrender.com`

Need help? Check Render's documentation or logs for detailed error messages.
