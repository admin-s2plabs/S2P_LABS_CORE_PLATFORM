import { Router, Request, Response } from "express";
import * as service from "./surveyform.service";
import { json } from "stream/consumers";

const router = Router();

router.post("/api/form/saveform", async (req: Request, res: Response) => 
{   
    try 
    {
        const sessionUser = (req as any).user || {};
        const formData = req.body;
        const savedData = await service.saveForm(formData, sessionUser.username);
        return res.status(200).json(savedData.id);
    }
    catch (error)    
    {
        console.error("Error saving form data:", error);
        return res.status(500).json({ success: false, message: "Failed to save form data" });
    }   
});

router.post("/api/forms/savequestions/:formId", async (req: Request, res: Response) =>
{
    try 
    {
        const sessionUser = (req as any).user || {};
        const formId = req.params.formId;
        const body = req.body;
        const formQuesData: any[] = Array.isArray(body.payload) ? body.payload : body;

        if (!Array.isArray(formQuesData)) {
            return res.status(400).json({
                success: false,
                message: "Invalid request body: expected an array of questions or { payload: [] }",
            });
        }

        const formData = await service.getFormById(formId);

        if (!formData) 
        {
            return res.status(404).json({
                success: false,
                message: "Form data is not available. Please check the form."
            });
        }

        await service.saveFormQuestions(formId, formQuesData, sessionUser.username,body.survey_title);
        return res.status(200).json({
                success: true,
                message: "Form Question added successfully..."
            });
    }
    catch (error)
    {
        console.error("Error retrieving form data:", error);
        return res.status(500).json({ success: false, message: "Failed to retrieve form data" });
    }   
});

router.get("/api/forms/getformbyid/:formId", async function getFormById(req: Request, res: Response) 
{
    try 
    {
        const  id  = req.params.formId;
        const formData = await service.getFormById(id);
        if (formData) 
        {
            const formQuestions = await service.getFormQuestions(id);
            return res.status(200).json({ success: true, data: formData, questions: formQuestions });
        } else {
            return res.status(404).json({ success: false, message: "Form not found" });
        }
    } catch (error) {
        console.error("Error retrieving form data:", error);
        return res.status(500).json({ success: false, message: "Failed to retrieve form data" });
    }  
});

router.get("/api/form/getAllForms", async (req: Request, res: Response) =>
{
    try
    {
        const formData = await service.getAllForms(req.query);
        return res.status(200).json(formData);
    }
    catch (error) {
        console.error("Error retrieving form data:", error);
        return res.status(500).json({ success: false, message: "Failed to retrieve form data" });
    }
});

router.get("/api/form/mapsurveyform/:formId",async (req: Request, res: Response) =>
{
    try
    {
        const id = req.params.formId;
        const formData = await service.getAllMappingsOfForm(id);
        return res.status(200).json(formData);
    }
    catch(error)
    {
        console.error("Error retrieving form data:", error);
        return res.status(500).json({ success: false, message: "Failed to retrieve form data" });
    }
});

router.get("/api/form/stats", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    const result = await service.getFormStats(sessionUser);
    const starResult = await service.getStarStats();
    return res.json(
        {
            ...result,
            ...starResult}
        );
  } catch (error: any) {
    handleError(res, error, "Failed to get Form stats");
  }
});

router.post("/api/form/surveyanswer/:formId/:refNumber", async (req,resp) =>
{
    try
    {
    const sessionuser = (req as any).user;
    const id=req.params.formId;
    const entityNumber=req.params.refNumber;
    const body = req.body;
    const formAnswerData:any [] = Array.isArray(body.payload) ? body.payload : body; 

    if (!Array.isArray(formAnswerData)) 
    {
        return resp.status(400).json({success: false,
                message: "Invalid request body: expected an array of questions or { payload: [] }",
        });
    }

    const formData = await service.getFormById(id);

        if (!formData) 
        {
            return resp.status(404).json({
                success: false,
                message: "Form data is not available. Please check the form."
            });
        }
        await service.saveFormQusAndAnswers(id, entityNumber,formAnswerData, sessionuser.username,formData.title,body.comment,body.type);

        return resp.status(200).json({
                success: true,
                message: "Form Question added successfully..."
            });
    }
    catch (error)
    {
        console.error("Error retrieving form data:", error);
        return resp.status(500).json({ success: false, message: "Failed to save survey response" });
    }
});

router.get("/api/form/surveyformresponse/:formId/:refnumber",async (req: Request, res: Response) =>
{
    try
    {
        const id = req.params.formId;
        const poNumber= req.params.refnumber;
        const formData = await service.getAllSurveyRespOfForm(id,poNumber);
        if (formData) 
        {
            const formRespAnswers = await service.getRespAnswers(formData.id);
            return res.status(200).json({ success: true, response: formData, respLineAnswer: formRespAnswers });
        } else {
            return res.status(404).json({ success: false, message: "Form not found" });
        }
    }
    catch(error)
    {
        console.error("Error retrieving form data:", error);
        return res.status(500).json({ success: false, message: "Failed to retrieve form data" });
    }
});

router.delete("/api/form/deletequestionbyid/:quesid", async (req: Request, res: Response) =>
{
    try
    {
        const quesId = req.params.quesid;
        const result = await service.deleteQuestionById(quesId);
        if(!result.includes("Error") || !result.includes("error") )
            return res.status(200).json({message: result+" "+quesId });
        else
            return res.status(500).json({message: result+" "+quesId });
    }
    catch(error)
    {
        console.error(error);
        return res.status(500).json({message: "Unable to delete question due to "+error });
    }
});

router.delete("/api/form/deleteformbyid/:formid", async (req: Request, res: Response) =>
{
    try
    {
        const formId = req.params.formid;
        const result = await service.deleteFromById(formId);
        if(!result.includes("Error") || !result.includes("error") )
            return res.status(200).json({message: result+" "+formId });
        else
            return res.status(500).json({message: result+" "+formId });
    }
    catch(error)
    {
        console.error(error);
        return res.status(500).json({message: "Unable to delete form due to "+error });
    }
});

router.post("/api/form/surveyanswer/:formId/:refNumber", async (req,resp) =>
{
    try
    {
    const sessionuser = (req as any).user;
    const id=req.params.formId;
    const entityNumber=req.params.refNumber;
    const body = req.body;
    const formAnswerData:any [] = Array.isArray(body.payload) ? body.payload : body; 

    if (!Array.isArray(formAnswerData)) 
    {
        return resp.status(400).json({success: false,
                message: "Invalid request body: expected an array of questions or { payload: [] }",
        });
    }

    const formData = await service.getFormById(id);

        if (!formData) 
        {
            return resp.status(404).json({
                success: false,
                message: "Form data is not available. Please check the form."
            });
        }
        await service.saveFormQusAndAnswers(id, entityNumber,formAnswerData, sessionuser.username,formData.title,body.comment,body.type);

        return resp.status(200).json({
                success: true,
                message: "Form Question added successfully..."
            });
    }
    catch (error)
    {
        console.error("Error retrieving form data:", error);
        return resp.status(500).json({ success: false, message: "Failed to save survey response" });
    }
});

router.get("/api/form/surveyformresponse/:suppid?",async (req: Request, res: Response) =>
{
    try
    {
        const id = req.params.suppid;
        const formData = await service.getAllResponse(req.query,id);
        return res.status(200).json(formData);
    }
    catch(error)
    {
        console.error("Error retrieving form data:", error);
        return res.status(500).json({ success: false, message: "Failed to retrieve form data" });
    }
});

router.post("/api/form/caluclatescore/:formId/:refNumber", async (req,resp) =>
{
    try
    {
    const sessionuser = (req as any).user;
    const id=req.params.formId;
    const entityNumber=req.params.refNumber;
    const body = req.body;
    const formAnswerData:any [] = Array.isArray(body.payload) ? body.payload : body; 

    if (!Array.isArray(formAnswerData)) 
    {
        return resp.status(400).json({success: false,
                message: "Invalid request body: expected an array of questions or { payload: [] }",
        });
    }

    const formData = await service.getFormById(id);

        if (!formData) 
        {
            return resp.status(404).json({
                success: false,
                message: "Form data is not available. Please check the form."
            });
        }
       const resultData =  await service.caluclateScoreForQuestion(id,formAnswerData);

        return resp.status(200).json({payload: resultData});
    }
    catch (error)
    {
        console.error("Error retrieving form data:", error);
        return resp.status(500).json({ success: false, message: "Failed to save survey response" });
    }
});

router.get("/api/form/mappedponumber/:formId",async(req,res) =>
{
    const sessionuser = (req as any).user ||null;
    const id = req.params.formId;
    const result = await service.getMappedPoNumbers(id);
    return res.status(200).json(result);
});

router.post("/api/form/enableordisableform",async(req,res) =>
{

    const sessionuser = (req as any).user ||null;
    const body = req.body;
    const formData = await service.getFormById(body.id);

        if (!formData) 
        {
            return res.status(404).json({
                success: false,
                message: "Form data is not available. Please check the form."
            });
        }

        const data = await service.enableOrDisableFormById(body.id,body.status);
        if(data.includes("Success"))
            return res.status(200).json(data);
        else
            return res.status(500).json(data);
});

router.post("/api/form/publishform",async(req,res) =>
{

    const sessionuser = (req as any).user ||null;
    const body = req.body;
    const formData = await service.getFormById(body.id);

        if (!formData) 
        {
            return res.status(404).json({
                success: false,
                message: "Form data is not available. Please check the form."
            });
        }

        const data = await service.publishform(body.id);
        if(data.includes("Success"))
            return res.status(200).json(data);
        else
            return res.status(500).json(data);
});

router.get("/api/form/supplierratestats/:supplierid",async (req,res) =>
{
    const suppId= req.params.supplierid;
    const data = await service.getSupplierRatingStats(suppId);
    if(data)
        return res.status(200).json(data);
    else
        return res.status(404).json({success:false,message:"No data found for supplier id "+suppId});
});

router.get("/api/form/responsestats/:type",async (req,res) =>
{
    const cardType= req.params.type;
    const data = await service.getResponseDataByStat(cardType,req.query);
    if(data)
        return res.status(200).json(data);
    else
        return res.status(404).json({success:false,message:"No data found for type "+cardType});
});

function handleError(res: any, error: any, fallbackMessage: string) {
  if (error?.status) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(fallbackMessage + ":", error);
 return  res.status(500).json({ error: error?.message || fallbackMessage });
}

router.patch("/api/form/modulestatus/:chatBot",async(req,res) => {
    try
    {
     const sessionUser = (req as any).user || {};
   const data = await service.updateEvaluationStatus(req.params.chatBot);
    return res.json(data);
  } 
  catch (error: any)
  {
    handleError(res, error, "Failed to update");
  }
});

router.get("/api/form/modulestatus",async(req,res) => {
    try
    {
     const sessionUser = (req as any).user || {};
    const moduleIsActive = await service.getEvaluationModuleStatus();
    return res.json({ moduleIsActive: moduleIsActive });
  } 
  catch (error: any)
  {
    handleError(res, error, "Failed to update");
  }
});

export const surveyFormController = router;