import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import {MongoClient} from "mongodb"
import Joi from "joi"


dotenv.config()

const server = express()
server.use([cors(), express.json()])

//Conexão com o database "uoldb"
const client = new MongoClient(process.env.MONGO_URL)
let db;

client.connect().then(() => {
db = client.db("uoldb")
})

//Validação do nome de usuário com a biblioteca joi
const schema = Joi.object().keys({
    name:Joi.string().required().alphanum()
})

//Rota participants que faz o registro do nome de usuário
server.post('/participants',(req,res)=>{
    const userName  = req.body
    const result = schema.validate(userName)
    if(result.error){
       return  res.sendStatus(422)
    }

    db.collection('participants').findOne(userName).then(user => {
        if(user){
            return res.sendStatus(409)
        }else{
            db.collection('participants').insertOne({name:userName.name, lastStatus: Date.now()}).then(() => {
                res.status(201).send("Usuário registrado")
              })
        }
    }) 
})

server.listen(5000)