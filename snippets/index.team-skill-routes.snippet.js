// index.js import részhez add hozzá:
const teamSkillRoutes = require('./routes/teamSkillRoutes');

// az app.use('/api', ...) sorok mellé add hozzá:
app.use('/api', teamSkillRoutes);
