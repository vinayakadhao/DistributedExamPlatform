# Distributed Online Examination Platform

## Project Description
A distributed web application for conducting online examinations. It provides separate services for authentication, examination management, question management, student attempts, and asynchronous evaluation.

## Features
- Student and teacher login
- Create examinations and questions
- Timed examination interface
- Save answers and submit examinations
- Asynchronous evaluation using RabbitMQ
- Results history and answer review

## Technologies
- Frontend: HTML, CSS, JavaScript
- Backend: Python, FastAPI
- Database: PostgreSQL
- Messaging: RabbitMQ
- Containerization: Docker and Docker Compose
- Version control: Git and GitHub

## System Architecture
The browser sends API requests to the gateway. The gateway routes requests to the relevant backend services. When a student submits an examination, the attempt service sends a message through RabbitMQ. The evaluation worker processes the submission and stores the result in PostgreSQL.

## Run the Project
Requirements: Docker Desktop, Docker Compose, and Git.

Clone the repository:
    git clone https://github.com/vinayakadhao/DistributedExamPlatform.git
    cd DistributedExamPlatform

Create a local environment file:
    Copy-Item .env.example .env

Edit .env with your own local credentials. Never commit this file to GitHub.

Build and start:
    docker compose up -d --build

Open http://localhost:8000

Check the containers:
    docker compose ps

## Distributed Systems Concepts
The application uses multiple services, API-based inter-service communication, message-queue-based asynchronous evaluation, persistent database storage, and containerized deployment. The evaluation worker is a candidate for horizontal scaling, subject to the Compose configuration.

## Team
- Vinayak Sanjay Adhao
- Soham Kolte

Confirm official PRNs and divisions in the college submission document.

## Repository
https://github.com/vinayakadhao/DistributedExamPlatform
