import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import Joi from "joi";
import dayjs from "dayjs";
import {stripHtml} from "string-strip-html"
import {ObjectId} from "mongodb"

dotenv.config();

const server = express();
server.use([cors(), express.json()]);

//Conexão com o database "uoldb"
const client = new MongoClient(process.env.MONGO_URL);
let db;

client.connect().then(() => {
  db = client.db("uoldb");
});

const time = `${dayjs().hour()}:${dayjs().minute()}:${dayjs().second()}`;

//Rota participants que faz o registro do nome de usuário
server.post("/participants", (req, res) => {
  const userName = req.body

  //Validação do nome de usuário com a biblioteca joi
  const schema = Joi.object().keys({
    name: Joi.string().required(),
  });

  const result = schema.validate(userName);
  if (result.error) {
    return res.sendStatus(422);
  }

  db.collection("participants")
    .findOne(userName)
    .then((user) => {
      if (user) {
        return res.sendStatus(409);
      } else {
        //Sanitizando nome do usuário
        userName.name = stripHtml(userName.name).result.trim()
       
        const participant = { ...userName, lastStatus: Date.now() };
        db.collection("participants").insertOne(participant);

        const mensagem = {
          from: userName.name,
          to: "Todos",
          text: "entra na sala...",
          type: "status",
          time,
        };

        db.collection("mensagens").insertOne(mensagem);

        res.status(201).send("Usuário registrado");
      }
    });
});

server.get("/participants", (req, res) => {
  db.collection("participants")
    .find()
    .toArray()
    .then((participants) => {
      res.send(participants);
    });
});

server.post("/messages", (req, res) => {
  let message = req.body;
  const from = req.headers.user;

  const schema = Joi.object().keys({
    to: Joi.string().required(),
    text: Joi.string().required(),
    type: Joi.string().required(),
    from: Joi.string(),
    time: Joi.string(),
  });
  //Sanitizando a mensagem de texto enviada pelo usuário
  message.text = stripHtml(message.text).result.trim()
  message = { ...message, from, time };
  const result = schema.validate(message);
  if (result.error) {
    return res.sendStatus(422);
  }

  db.collection("mensagens")
    .insertOne(message)
    .then(() => {
      res.send(message);
    });
});

server.get("/messages", (req, res) => {
  const userLog = req.headers.user;

  db.collection("mensagens")
    .find()
    .toArray()
    .then((mensagens) => {
      let msgs = mensagens.filter(
        (msg) =>
          msg.type === "status" ||
          msg.to === userLog ||
          msg.from === userLog ||
          msg.type === "message"
      );

      res.send(msgs);
    });
});

server.post('/status', (req,res) => {
    const userName = req.headers.user

         db.collection("participants").findOne({name: userName}).then(participant => {
       if(participant){
        db.collection("participants").updateOne({name: userName}, {
            $set: {lastStatus:Date.now()}
            
        })
        res.sendStatus(200)
       }else{
        return res.sendStatus(404)
       }
    })
   
    
})

server.delete("/messages/:id",(req, res) => {
    const name = req.headers.user
    const id = req.params.id
   
console.log(id)
  db.collection("mensagens").findOne({_id: ObjectId(id)}).then(msg => {
    console.log(msg)
    if(!msg){
      return  res.sendStatus(404)
    }
    if(msg.from !== name){
      return res.sendStatus(401)
    }

    db.collection("mensagens").deleteOne(msg).then(() => {
      res.status(200).send(msg)
    })
    
  

  })

})

setInterval(() => {
    db.collection("participants")
      .find()
      .toArray()
      .then((participants) => {
        participants.map((participant) => {
          if ((Date.now() - participant.lastStatus) / 1000 > 10) {
            db.collection("participants")
              .deleteOne(participant)
              .then(() => {
                db.collection("mensagens").insertOne({
                  from: participant.name,
                  to: "Todos",
                  text: "sai da sala...",
                  type: "status",
                  time,
                });
               });
          }
        });
      });
  }, 15000);


server.listen(5000);
