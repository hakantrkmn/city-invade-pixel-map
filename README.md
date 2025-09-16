# City Fight - Real-time Territorial Conquest Game

A real-time multiplayer game where players compete to conquer territories on a pixelated map of the United States. Choose your state, paint pixels, and expand your territory in this strategic conquest game!

## 🎮 Game Features

- **Real-time Multiplayer**: Live territorial conquest with instant updates
- **Reddit Authentication**: Login with Reddit to join the battle
- **Strategic Gameplay**: Choose your state and expand its territory pixel by pixel
- **Cooldown System**: 5-minute cooldown prevents spam painting
- **Interactive Map**: Zoom, pan, and click to paint pixels
- **Mobile Support**: Touch controls for mobile devices
- **Live Leaderboard**: See defender counts for each state
- **Persistent Data**: All changes saved in real-time to Firebase

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- A Firebase project with Realtime Database enabled
- A Reddit app for OAuth authentication

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/City-Fight.git
   cd City-Fight
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Firebase**
   - Create a new Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Enable Realtime Database
   - Copy your Firebase config to environment variables or create a `.env` file:
     ```
     VITE_FB_APIKEY=your_api_key
     VITE_FB_AUTHDOMAIN=your_project.firebaseapp.com
     VITE_FB_PROJECTID=your_project_id
     VITE_FB_STORAGE=your_project.appspot.com
     VITE_FB_SENDER=your_sender_id
     VITE_FB_APPID=your_app_id
     VITE_FB_MEAS=your_measurement_id
     VITE_FB_DBURL=https://your_project-default-rtdb.region.firebasedatabase.app
     ```

4. **Set up Reddit OAuth**
   - Go to [Reddit Apps](https://www.reddit.com/prefs/apps)
   - Create a new app (type: web app)
   - Set redirect URI to: `http://localhost:5173/` (for development)
   - Update the `REDDIT_CLIENT_ID` in `script.js` with your client ID

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser** and navigate to `http://localhost:5173/`

## 🎯 How to Play

1. **Login**: Click the "Login with Reddit" button to authenticate
2. **Choose State**: Select your state from the dropdown menu
3. **Paint Territory**: Click on unclaimed pixels or enemy territory to expand
4. **Strategic Timing**: Wait 5 minutes between paintings to avoid cooldown
5. **Defend**: Help your state's defenders maintain control
6. **Conquer**: Take over enemy territories strategically

### Controls

- **Mouse**: Click to paint pixels, drag to pan
- **Mouse Wheel**: Zoom in/out
- **Touch**: Tap to paint, drag to pan, pinch to zoom
- **Tooltip**: Hover over pixels to see ownership and defender info

## 🛠️ Technology Stack

- **Frontend**: Vanilla JavaScript (ES6+)
- **Build Tool**: Vite
- **Database**: Firebase Realtime Database
- **Authentication**: Reddit OAuth 2.0 (PKCE flow)
- **Styling**: Custom CSS
- **Maps**: GeoJSON data for US state boundaries

## 📁 Project Structure

```
City-Fight/
├── dist/                 # Built production files
├── node_modules/         # Dependencies
├── public/               # Static assets
├── firebaseConfig.example.js  # Firebase config template
├── index.html           # Main HTML file
├── script.js            # Main game logic
├── style.css            # Stylesheets
├── tr.json             # Turkey map data (unused)
├── us-states.json       # US states GeoJSON data
├── vite.config.js       # Vite configuration
└── package.json         # Project dependencies
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory with your Firebase configuration:

```env
VITE_FB_APIKEY=your_firebase_api_key
VITE_FB_AUTHDOMAIN=your_project.firebaseapp.com
VITE_FB_PROJECTID=your_firebase_project_id
VITE_FB_STORAGE=your_project.appspot.com
VITE_FB_SENDER=your_sender_id
VITE_FB_APPID=your_app_id
VITE_FB_MEAS=your_measurement_id
VITE_FB_DBURL=https://your_project-default-rtdb.region.firebasedatabase.app
```

### Reddit OAuth Setup

1. Create a Reddit app at https://www.reddit.com/prefs/apps/
2. Set the app type to "web app"
3. Configure the redirect URI:
   - Development: `http://localhost:5173/`
   - Production: `https://yourusername.github.io/city-invade-pixel-map/`
4. Update the `REDDIT_CLIENT_ID` constant in `script.js`

## 🚀 Deployment

### GitHub Pages

1. **Build the project**
   ```bash
   npm run build
   ```

2. **Deploy to GitHub Pages**
   ```bash
   # If using GitHub Actions, the dist/ folder will be deployed automatically
   # Or manually upload the dist/ folder contents to your GitHub Pages branch
   ```

3. **Update redirect URI** in your Reddit app settings for production

### Other Platforms

The built files in `dist/` can be deployed to any static hosting service:
- Netlify
- Vercel
- Firebase Hosting
- AWS S3 + CloudFront

## 🎨 Game Mechanics

### Pixel Ownership
- Each pixel on the map belongs to a state or is unclaimed
- Players can only paint pixels for their chosen state
- Painting an enemy pixel claims it for your state

### Cooldown System
- 5-minute cooldown between paintings
- Cooldown is tracked per Reddit user across devices
- Real-time synchronization via Firebase

### Real-time Updates
- All pixel changes appear instantly for all players
- Player counts update in real-time
- Firebase listeners ensure data consistency

### State Selection
- Choose from all 48 contiguous US states (excluding Alaska and Hawaii)
- Each state has a unique color
- Cannot change state once selected (persisted in localStorage)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and test thoroughly
4. Commit your changes: `git commit -am 'Add new feature'`
5. Push to the branch: `git push origin feature-name`
6. Submit a pull request

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 🐛 Known Issues & Future Enhancements

- **Admin Controls**: Currently no admin interface for moderation
- **Performance**: Large maps may cause performance issues on low-end devices
- **Mobile Optimization**: Could benefit from better mobile UI
- **Chat System**: No in-game communication system
- **Alliances**: No team-based gameplay mechanics
- **Statistics**: No detailed player statistics tracking

## 📞 Support

If you encounter issues:
1. Check the browser console for errors
2. Ensure Firebase and Reddit configurations are correct
3. Verify your internet connection for real-time features

## 🙏 Acknowledgments

- US state boundary data from GeoJSON sources
- Firebase for real-time database functionality
- Reddit for OAuth authentication
- Vite for fast development and building

---

**Happy conquering! 🏆**
hakantrkmn
