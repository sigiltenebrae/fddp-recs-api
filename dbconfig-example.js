//sample file. copy to dbconfig.js with actual values

module.exports = {
    HOST: "",
    USER: "",
    PASSWORD: "",
    DB: "",
    dialect: "postgres",
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    }
};