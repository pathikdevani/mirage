# Mirage
mirage is tool to generate fake data as flexible as possible using web UI. Let me dive what are the though i have about mirage product. 

Mirage product is driverd by below main topics.

## Workspace
Each workspace(similar to application), we should have ability to create Schema and sets, All the scheama and set will be part of workspace. User can create multiple workspace as many as user want.

## Schema
user can define schema or create schema using ui, this schema are basically tell eveything about stucture of data. Like propoerty name, type of the value, method to generete fake data (mainly we will use faker.js properoty), also we will have ability to create custome methodos. 

User can create list of schemas. And also user can give cross referance in to each other. System will show if there cyclic loop and show in the UI with full detail to debug. 

We will have so many type of data to generate. Also we will suppor object and array in any level. (till N level infiite). Also we can have opetion to control how big or small or random array size can be.

User can visally also see the all the relationship and cross referance. 



## Generator
Think like i want to generete set of data, I will add all the schema i want to have the part of this set. 

ex: Generete people in reem island area from indian nationality, Have pilipili pepople in abu dhabi city area etc. 

Each set can have indivisual purpose and total data count, each data set / scheama can have diffrent number of recoread to generete.

Ex: set1 - schema1, schame2, scheam3 i can tell scheam1 50 records, scheame 2 100 records, scheam3 10 records. 

Now each scheam can have diffrent number of the records, cross refrance should have logic to define, we can not give 1:1 only option, we should have 1:1, radom pic, avg split, or write function for logic (typescript) and if there more exist such logic i would like to add in application. 

each set should have uniqe salt, which will allow to generete same data every time. 

## Data Connecter
Once in workspace we genetet all the set, now we have time export in many formate excel, json, zip, csv etc.

Also user will have option to connect or export to database like mongoDB, postgressSQL, elasticsearch or API, webhook etc. 
