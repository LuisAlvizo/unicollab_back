const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken'); // Agregado para manejar tokens JWT

const app = express();

// Crear el directorio 'uploads' si no existe
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Configuración de almacenamiento de multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Configuración de MySQL
const connection = mysql.createConnection({
  host: '192.168.100.118',
  user: 'cluster1',
  password: 'Password123#',
  database: 'mydb'
});

connection.connect();

// Middleware para parsear solicitudes JSON
app.use(bodyParser.json());
app.use('/uploads', express.static('uploads')); // Para servir las imágenes subidas

// Ruta para el inicio de sesión
app.post('/api/login', (req, res) => {
  const { email, contrasena } = req.body;

  // Hashear la contraseña proporcionada para la comparación
  const hashedPassword = crypto.createHash('sha256').update(contrasena).digest('hex');

  // Consulta SQL para verificar las credenciales del usuario
  const query = `SELECT * FROM usuario WHERE CorreoElectronico = ? AND Contrasena = ?`;

  connection.query(query, [email, hashedPassword], (error, results) => {
    if (error) {
      console.error('Error de consulta:', error);
      res.status(500).json({ success: false, message: 'Error de servidor' });
    } else {
      if (results.length > 0) {
        const user = results[0];
        // Crear un token JWT para el usuario autenticado
        const token = jwt.sign({ email: user.CorreoElectronico, rol: user.Rol }, 'secreto', { expiresIn: '1h' });
        res.json({ success: true, message: 'Inicio de sesión exitoso', token, user: { ...user, Rol: user.Rol } });
      } else {
        res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
      }
    }
  });
});

// Ruta para registrar un nuevo usuario
app.post('/api/register', upload.single('foto'), (req, res) => {
  const { nombre, apellido, email, contrasena, rol, idCurso } = req.body;
  const foto = req.file ? `/uploads/${req.file.filename}` : null;

  // Hashear la contraseña antes de almacenarla
  const hashedPassword = crypto.createHash('sha256').update(contrasena).digest('hex');

  // Verificar si el usuario ya existe en la base de datos
  const queryBuscarUsuario = 'SELECT * FROM usuario WHERE CorreoElectronico = ?';
  connection.query(queryBuscarUsuario, [email], (error, results) => {
    if (error) {
      console.error('Error al buscar usuario:', error);
      return res.status(500).json({ success: false, message: 'Error de servidor' });
    }
    if (results.length > 0) {
      // El usuario ya existe
      return res.status(409).json({ success: false, message: 'El usuario ya existe' });
    }

    // Insertar nuevo usuario en la base de datos
    const queryInsertarUsuario = 'INSERT INTO usuario (Nombre, Apellido, CorreoElectronico, Contrasena, Rol, FotoPerfil, Carrera_IdCarrera) VALUES (?, ?, ?, ?, ?, ?, ?)';
    connection.query(queryInsertarUsuario, [nombre, apellido, email, hashedPassword, rol, foto, idCurso], (error, results) => {
      if (error) {
        console.error('Error al insertar usuario:', error);
        return res.status(500).json({ success: false, message: 'Error de servidor' });
      }
      // Usuario registrado exitosamente
      res.status(201).json({ success: true, message: 'Usuario registrado exitosamente' });
    });
  });
});

app.get('/api/check-session', (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  jwt.verify(token, 'secreto', (error, decoded) => {
    if (error) {
      return res.status(401).json({ success: false, message: 'Sesión no válida' });
    } else {
      // Aquí podrías realizar más validaciones o consultar la base de datos para obtener información adicional del usuario
      res.json({ success: true, user: { email: decoded.email, rol: decoded.rol } });
    }
  });
});

// Ruta para cerrar sesión (logout)
app.get('/api/logout', (req, res) => {
  // Eliminar el token del localStorage
  // Eliminar el usuario del localStorage
  res.json({ success: true, message: 'Logout exitoso' });
});

// Ruta para obtener todos los posts
app.get('/api/posts', (req, res) => {
  const currentPage = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  
  // Consulta SQL para obtener el total de posts
  connection.query('SELECT COUNT(*) AS total FROM post', (error, results) => {
    if (error) {
      console.error('Error al obtener el total de posts:', error);
      res.status(500).json({ success: false, message: 'Error de servidor' });
    } else {
      const totalPosts = results[0].total;
      const totalPages = Math.ceil(totalPosts / limit);

      // Consulta SQL para obtener los posts de la página actual
      const offset = (currentPage - 1) * limit;
      connection.query('SELECT * FROM post LIMIT ?, ?', [offset, limit], (error, results) => {
        if (error) {
          console.error('Error al obtener los posts:', error);
          res.status(500).json({ success: false, message: 'Error de servidor' });
        } else {
          res.json({ success: true, posts: results, totalPages });
        }
      });
    }
  });
});

// Ruta para agregar un nuevo post
app.post('/api/agregarpost', (req, res) => {
  const { Titulo, Descripcion, Estatus, Categoria, Usuario_idUsuario } = req.body;

  // Insertar el nuevo post en la base de datos
  const query = 'INSERT INTO post (Titulo, Descripcion, FechaCreacion, Estatus, Categoria, Usuario_idUsuario) VALUES (?, ?, ?, ?, ?, ?)';
  const currentDate = new Date().toISOString().slice(0, 19).replace('T', ' '); // Obtener la fecha y hora actual en el formato correcto
  connection.query(query, [Titulo, Descripcion, currentDate, Estatus, Categoria, Usuario_idUsuario], (error, results) => {
    if (error) {
      console.error('Error al agregar post:', error);
      res.status(500).json({ success: false, message: 'Error de servidor' });
    } else {
      const insertedId = results.insertId;
      res.status(201).json({ success: true, message: 'Post agregado correctamente', postId: insertedId });
    }
  });
});


// Ruta para obtener todos los comentarios de un post específico
app.get('/api/post/:postId/comments', (req, res) => {
  const postId = req.params.postId;

  // Consulta SQL para obtener los comentarios de un post
  const query = `SELECT c.idComentario, c.Texto, c.FechaCreacion, u.Nombre AS NombreUsuario, u.Apellido AS ApellidoUsuario
                 FROM comentario c
                 INNER JOIN usuario u ON c.Usuario_idUsuario = u.idUsuario
                 WHERE c.Post_idPost = ?`;

  connection.query(query, [postId], (error, results) => {
    if (error) {
      console.error('Error de consulta:', error);
      res.status(500).json({ success: false, message: 'Error de servidor' });
    } else {
      res.json({ success: true, comments: results });
    }
  });
});

// Ruta para agregar un comentario a un post
app.post('/api/post/:postId/comment', (req, res) => {
  const { postId } = req.params;
  const { texto, Usuario_idUsuario, postUsuarioId, revisionId } = req.body;

  // Insertar el comentario en la base de datos
  const query = 'INSERT INTO comentario (Texto, FechaCreacion, Usuario_idUsuario, Post_idPost, Post_Usuario_idUsuario, Revision_idRevision) VALUES (?, ?, ?, ?, ?, ?)';
  connection.query(query, [texto, new Date(), Usuario_idUsuario, postId, postUsuarioId, revisionId], (error, results) => {
    if (error) {
      console.error('Error al agregar comentario:', error);
      res.status(500).json({ success: false, message: 'Error de servidor' });
    } else {
      const insertedId = results.insertId;
      res.json({ success: true, message: 'Comentario agregado correctamente', comment: { idComentario: insertedId, Texto: texto } });
    }
  });
});


// Ruta para obtener los posts de un usuario específico
app.get('/api/user/:userId/posts', (req, res) => {
  const userId = req.params.userId;

  // Consulta SQL para obtener los posts de un usuario
  const query = `SELECT * FROM post WHERE Usuario_idUsuario = ?`;

  connection.query(query, [userId], (error, results) => {
    if (error) {
      console.error('Error al obtener los posts del usuario:', error);
      res.status(500).json({ success: false, message: 'Error de servidor' });
    } else {
      res.json({ success: true, posts: results });
    }
  });
});

// Ruta para actualizar un post existente
app.put('/api/post/:postId', (req, res) => {
  const postId = req.params.postId;
  const { Titulo, Descripcion, Estatus, Categoria, Usuario_idUsuario } = req.body;

  // Actualizar el post en la base de datos
  const query = 'UPDATE post SET Titulo = ?, Descripcion = ?, Estatus = ?, Categoria = ?, Usuario_idUsuario = ? WHERE idPost = ?';
  connection.query(query, [Titulo, Descripcion, Estatus, Categoria, Usuario_idUsuario, postId], (error, results) => {
    if (error) {
      console.error('Error al actualizar post:', error);
      res.status(500).json({ success: false, message: 'Error de servidor' });
    } else {
      res.json({ success: true, message: 'Post actualizado correctamente' });
    }
  });
});

// Ruta para actualizar un post existente
app.put('/api/post/:postId/update', (req, res) => {
  const postId = req.params.postId;
  const { Titulo, Descripcion, Estatus, Categoria, Usuario_idUsuario } = req.body;

  // Actualizar el post en la base de datos
  const query = 'UPDATE post SET Titulo = ?, Descripcion = ?, Estatus = ?, Categoria = ?, Usuario_idUsuario = ? WHERE idPost = ?';
  connection.query(query, [Titulo, Descripcion, Estatus, Categoria, Usuario_idUsuario, postId], (error, results) => {
    if (error) {
      console.error('Error al actualizar post:', error);
      res.status(500).json({ success: false, message: 'Error de servidor' });
    } else {
      res.json({ success: true, message: 'Post actualizado correctamente' });
    }
  });
});

// Ruta para eliminar un post existente
app.delete('/api/post/:postId/delete', (req, res) => {
  const postId = req.params.postId;

  // Eliminar el post de la base de datos
  const query = 'DELETE FROM post WHERE idPost = ?';
  connection.query(query, [postId], (error, results) => {
    if (error) {
      console.error('Error al eliminar post:', error);
      res.status(500).json({ success: false, message: 'Error de servidor' });
    } else {
      res.json({ success: true, message: 'Post eliminado correctamente' });
    }
  });
});

app.delete('/api/post/:postId/comment/:commentId', (req, res) => {
  const postId = req.params.postId;
  const commentId = req.params.commentId;

  // Lógica para eliminar el comentario del post en la base de datos
  const query = 'DELETE FROM comentario WHERE Post_idPost = ? AND idComentario = ?';
  connection.query(query, [postId, commentId], (error, results) => {
    if (error) {
      console.error('Error al eliminar comentario:', error);
      res.status(500).json({ success: false, message: 'Error de servidor' });
    } else {
      res.json({ success: true, message: 'Comentario eliminado correctamente' });
    }
  });
});


// Ruta para obtener posts por categoría
app.get('/api/postsByCategory', (req, res) => {
  const { categoria } = req.query;

  // Consulta SQL para obtener los posts por categoría
  const query = `SELECT * FROM post WHERE Categoria = ?`;

  connection.query(query, [categoria], (error, results) => {
    if (error) {
      console.error('Error al obtener los posts por categoría:', error);
      res.status(500).json({ success: false, message: 'Error de servidor' });
    } else {
      res.json({ success: true, posts: results });
    }
  });
});

// Ruta para obtener la información completa de un usuario por su ID
app.get('/api/user/:userId', (req, res) => {
  const userId = req.params.userId;

  // Consulta SQL para obtener la información del usuario por su ID
  const query = `SELECT * FROM usuario WHERE idUsuario = ?`;

  connection.query(query, [userId], (error, results) => {
    if (error) {
      console.error('Error fetching user data:', error);
      res.status(500).json({ success: false, message: 'Error de servidor' });
    } else {
      if (results.length > 0) {
        const user = results[0];
        res.json({ success: true, user });
      } else {
        res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      }
    }
  });
});

// Ruta para agregar la valoración a un post
// Ruta para valorar un comentario de un post
app.post('/api/post/:postId/comment/:commentId/rate', (req, res) => {
  const { postId, commentId } = req.params;
  const { rating } = req.body;

  // Realizar la lógica para guardar la valoración del comentario en la base de datos
  // Por ejemplo, actualizar el campo "Valoracion" en la tabla de comentarios
  const query = 'UPDATE comentario SET Valoracion = ? WHERE idComentario = ? AND Post_idPost = ?';
  connection.query(query, [rating, commentId, postId], (error, results) => {
    if (error) {
      console.error('Error al actualizar la valoración del comentario:', error);
      res.status(500).json({ success: false, message: 'Error de servidor' });
    } else {
      res.json({ success: true, message: 'Valoración del comentario actualizada correctamente' });
    }
  });
});

// Ruta para obtener todos los usuarios
app.get('/api/users', (req, res) => {
  const query = 'SELECT * FROM usuario';

  connection.query(query, (error, results) => {
    if (error) {
      console.error('Error al obtener los usuarios:', error);
      res.status(500).json({ success: false, message: 'Error de servidor' });
    } else {
      res.json({ success: true, users: results });
    }
  });
});

// Ruta para eliminar un usuario
app.delete('/api/user/:userId', (req, res) => {
  const userId = req.params.userId;

  // Lógica para eliminar el usuario de la base de datos
  const query = 'DELETE FROM usuario WHERE idUsuario = ?';
  connection.query(query, [userId], (error, results) => {
    if (error) {
      console.error('Error al eliminar usuario:', error);
      res.status(500).json({ success: false, message: 'Error de servidor' });
    } else {
      res.json({ success: true, message: 'Usuario eliminado correctamente' });
    }
  });
});


app.listen(3030, () => {
  console.log('Servidor Express en ejecución en el puerto 3030');
});
