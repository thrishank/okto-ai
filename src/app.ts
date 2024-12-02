import express from "express";
import bodyParser from 'body-parser';
// import bot from ".";

const app = express();

app.use(bodyParser.json())

app.post("/api/message", (req, res) => {

})