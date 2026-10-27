const mongoose = require("mongoose")
const dns = require("dns")

dns.setServers(["8.8.8.8", "8.8.4.4"])

const connectDB = async () => {
    await mongoose.connect(
        "mongodb+srv://immanoj2830_db_user:manoj2830@namaste-nodejs.rjypov2.mongodb.net/hackpair?appName=namaste-nodejs"
    );
};

module.exports = connectDB;
