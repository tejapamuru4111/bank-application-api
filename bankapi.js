const express = require("express")
const {open} = require("sqlite")
const sqlite3 = require("sqlite3")
const path = require("path")
const cors = require("cors")
const { json } = require("express");
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const format = require("date-fns/format");

const databasePath = path.join(__dirname,"bank.db")

const app = express()

let database = null

app.use(cors({
    origin: "*",
  }))

app.use(json())


const initializeDbAndServer = async() => {
    try{
        database = await open({
            filename : databasePath,
            driver : sqlite3.Database
        })
        app.listen(3011, () =>
        console.log("Server Running at http://localhost:3011/")
    );
    }
    catch (error) {
        console.log(`DB Error: ${error.message}`);
        process.exit(1);
    }
}

initializeDbAndServer()

function authenticateToken(request, response, next) {
    let jwtToken;
    const authHeader = request.headers["authorization"];
    if (authHeader !== undefined) {
      jwtToken = authHeader.split(" ")[1];
    }
    if (jwtToken === undefined) {
      response.status(401);
      response.send("Invalid JWT Token");
    } else {
      jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.userName;
          next();
        }
      });
  }
}


app.post('/register', async(request, response) => {
    const {id, userName, password, firstName, lastName, role, bal, employeeId} = request.body
    const hashedPassword = await bcrypt.hash(password, 10);
    const selectUserQuery = `SELECT * FROM users WHERE user_name = '${userName}'`;
    const dbUser = await database.get(selectUserQuery);
    if (dbUser === undefined) {
      const createUserQuery = `
        INSERT INTO 
          users (user_id, first_name, last_name, user_name, password, role, bal, employee_id) 
        VALUES 
          (
            '${id}', 
            '${firstName}',
            '${lastName}', 
            '${userName}',
            '${hashedPassword}',
            '${role}',
             ${bal},
            '${employeeId}'
          )`;
      const dbResponse = await database.run(createUserQuery);
      const newUserId = dbResponse.lastID;
      response.json(`Created new user with ${newUserId}`);
    } else {
      response.status(400);
      response.json("Username already exists");
    }
})

app.post("/login", async (request, response) => {
    const { userName, password } = request.body;
    const selectUserQuery = `SELECT * FROM users WHERE user_name = '${userName}'`;
    const dbUser = await database.get(selectUserQuery);
    if (dbUser === undefined) {
      response.status(400);
      response.json("Invalid User");
    } else {
      const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
      if (isPasswordMatched === true) {
        const payload = {
          userName: userName,
        };
        const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
        response.send({ jwtToken });
      } else {
        response.status(400);
        response.json("Invalid Password");
      }
    }
});


app.get("/",authenticateToken, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `SELECT * FROM users WHERE user_name = '${username}'`;
  const dbUser = await database.get(selectUserQuery);
  response.send(dbUser)
});

app.get("/users",authenticateToken, async (request, response) => {
  const selectUserQuery = `SELECT * FROM users WHERE role LIKE 'Customer'`;
  const customers = await database.all(selectUserQuery);
  response.send(customers)
});

app.get("/:userId/transactions",authenticateToken, async (request, response) => {
  const {userId} = request.params
  const selectUserQuery = `SELECT * FROM transactions WHERE user_id LIKE '${userId}' ORDER BY date DESC;`;
  const getBalenceQuery = `SELECT * FROM users WHERE user_id LIKE '${userId}';`;
  const userTransactions = await database.all(selectUserQuery);
  const user = await database.get(getBalenceQuery)
  response.json({userTransactions, user})
});


app.post("/transaction",authenticateToken, async (request, response) => {
  const {userId, ammount, id, type, balence } = request.body
  const date = new Date()
  const foamatDate = format(date, "yyyy-MM-dd HH:mm:ss");
  const postUserQuery = `INSERT INTO transactions 
                                 (transaction_id, type, ammount, date, user_id)
                          VALUES (
                              '${id}',
                              '${type}',
                              ${ammount},
                              '${foamatDate}',
                              '${userId}'
                          );`;
  const updateBalenceQuery = `UPDATE users SET bal = ${balence} WHERE user_id LIKE '${userId}';`;
  const getBalenceQuery = `SELECT bal FROM users WHERE user_id LIKE '${userId}';`;
  await database.run(postUserQuery);
  await database.run(updateBalenceQuery);
  const updatedBal = await database.get(getBalenceQuery)
  response.json(updatedBal.bal)
});
