import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import Joi from "joi";
import dayjs from "dayjs";
import { stripHtml } from "string-strip-html";

dotenv.config();

const server = express();
server.use([cors(), express.json()]);

//Conexão com o database "uoldb"
const client = new MongoClient(process.env.MONGO_URI);
let db;

client.connect().then(() => {
  db = client.db("uoldb");
});

let time = `${dayjs().hour()}:${dayjs().minute()}:${dayjs().second()}`;

//Endpoint que faz o registro do nome de usuário
server.post("/participants", async (req, res) => {
  const userName = req.body;

  //Validação do nome de usuário com a biblioteca joi
  const schema = Joi.object().keys({
    name: Joi.string().pattern(/^[a-z]+$/i).required(),
  });

  const result = schema.validate(userName);
  if (result.error) {
    return res.sendStatus(422);
  }

  try {
    const user = await db.collection("participants").findOne(userName);
    if (user) {
      return res.sendStatus(409);
    }
    //Sanitizando nome do usuário
    userName.name = stripHtml(userName.name).result.trim();

    const participant = { ...userName, lastStatus: Date.now() };
    await db.collection("participants").insertOne(participant);

    const mensagem = {
      from: userName.name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time,
    };

    await db.collection("mensagens").insertOne(mensagem);
    res.status(201).send("Usuário registrado");

  } catch (error) {
    return res.sendStatus(500);
  }
});

//Endpoint que disponibiliza a lista de participantes
server.get("/participants", async (req, res) => {
  const participants = await db.collection("participants").find().toArray();
  res.send(participants);
});

//Endpoint para envio de mensagens
server.post("/messages", async (req, res) => {
  let message = req.body;
  const from = req.headers.user;

  const schema = Joi.object().keys({
    to: Joi.string().required(),
    text: Joi.string().required(),
    type: Joi.string().valid("message","private_message").required(),
    
    
  });
  //Sanitizando a mensagem de texto enviada pelo usuário
  message.text = stripHtml(message.text).result.trim();
  
  const result = schema.validate(message);
  if (result.error) {

    return res.sendStatus(422);
  }
  message = { ...message, from, time }

  try {
    await db.collection("mensagens").insertOne(message)
    res.send(message);
  
  } catch (error) {
    return res.sendStatus(500)
  }
 
});

//Endpoint que disponibiliza as mensagens pertinentes ao usuário logado
server.get("/messages", async (req, res) => {
  const userLog = req.headers.user;
  const limit = Number(req.query.limit);

  try {
    let mensagens = await  db.collection("mensagens").find().toArray()
      mensagens = mensagens.slice(-limit);
      let msgsUser = mensagens.filter(
        (msg) =>
          msg.type === "status" ||
          msg.to === userLog ||
          msg.from === userLog ||
          msg.to === "Todos"
      );

      res.send(msgsUser);
  } catch (error) {
      res.sendStatus(500)
  }
    
});

//Endpoint para atualizar o status do usuário
server.post("/status", async (req, res) => {
  const userName = req.headers.user;

  try {
    const participant = await db.collection("participants").findOne({ name: userName })

    if(!participant) return res.sendStatus(404)

    await db.collection("participants").updateOne({ name: userName },{$set: { lastStatus: Date.now() }})
    res.sendStatus(200);

  } catch (error) {
    res.sendStatus(500)
  }
});

//Endpoint para deletar mensagens
server.delete("/messages/:id", async (req, res) => {
  const name = req.headers.user;
  const id = req.params.id;

  try {
    const msg = await db.collection("mensagens").findOne({ _id: ObjectId(id) })

    if(!msg) return res.sendStatus(404)
    if(msg.from !== name) return res.sendStatus(401)

    await db.collection("mensagens").deleteOne(msg)
    res.status(200).send(msg);

  } catch (error) {
    res.sendStatus(500)
  } 
});

//Endpoint para edição de mensagens
server.put("/messages/:id", async (req, res) => {
  const message = req.body;
  const from = req.headers.user;
  const id = req.params.id;

  const schema = Joi.object().keys({
    to: Joi.string().required(),
    text: Joi.string().required(),
    type: Joi.string().valid("message", "private_message").required(),
  });

  const result = schema.validate(message);
  if (result.error) {
    return res.sendStatus(422);
  }

  try {
    const msg = db.collection("mensagens").findOne({ _id: ObjectId(id) })

    if(!msg) return res.sendStatus(404)
    if(msg.from !== from) return res.sendStatus(401);

    time = `${dayjs().hour()}:${dayjs().minute()}:${dayjs().second()}`;

    await db.collection("mensagens").updateOne({ _id: ObjectId(id) },{$set: { ...message, time }});

    res.status(200).send("Mensagem atualizada")

  } catch (error) {
    res.sendStatus(500)
  }

});

//Remoção de participantes inativos
setInterval( async () => {

  const participants = await db.collection("participants").find().toArray()

  participants.map( async (participant) => { 
    if ((Date.now() - participant.lastStatus) / 1000 > 10){
      await db.collection("participants").deleteOne(participant)
      await db.collection("mensagens").insertOne({from: participant.name, to: "Todos", text: "sai da sala...",type: "status",time,});
    }
  })

}, 15000);

server.listen(5000);
