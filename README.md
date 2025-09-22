git clone https://github.com/MaheshSriramula033/Bug-Reporting-Tracking-System-
cd yourrepo
npm install
cp .env.example .env
# Fill in your MongoDB URI and session secret
npm start
### User Schema
- name: String
- email: String (unique)
- passwordHash: String
- role: 'reporter' | 'admin'
- createdAt: Date

### Bug Schema
- title: String
- description: String
- severity: 'Low' | 'Medium' | 'High'
- status: 'Open' | 'In Progress' | 'Closed'
- reporter: User (ref)
- createdAt / updatedAt: Date
<img width="1120" height="309" alt="db_schema_diagram" src="https://github.com/user-attachments/assets/e2b2b95a-7a94-44bc-a394-e1e86ea887bc" />


- Live App: https://bug-reporting-tracking-system.onrender.com

- ### AI Usage Notes
Used ChatGPT to:
- Help structure Express routes.
- Debug flash message visibility.
- boilerplate creation.
